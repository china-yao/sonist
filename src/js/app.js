/**
 * {sonist app}
 * @author yutent<yutent@doui.cc>
 * @date 2018/12/16 17:15:57
 */

import '/lib/anot.next.js'
import layer from '/lib/layer/index.js'
import store from '/lib/store/index.js'
import AudioPlayer from '/lib/audio/index.js'
import Lyrics from '/lib/lyrics/index.js'

import Api from '/js/api.js'

import Artist from '/js/modules/artist.js'
import Local from '/js/modules/local.js'
import Profile from '/js/modules/profile.js'
import Search from '/js/modules/search.js'

import KTV from '/js/modules/ktv.js'
import PLAYCTRL from '/js/modules/play-ctrl.js'

import {
  createDesktopLrcWindow,
  createMiniWindow
} from '/js/modules/extra-win.js'

const log = console.log

const fs = require('iofs')
const path = require('path')

const { remote } = require('electron')

const WIN = remote.getCurrentWindow()
const MAIN_SCREEN = remote.screen.getPrimaryDisplay()

const HOME_PATH = remote.app.getPath('appData')
const APP_INI_PATH = path.join(HOME_PATH, 'app.ini')
const LYRICS_PATH = path.join(HOME_PATH, 'lyrics')
const PLAY_MODE = {
  0: 'all',
  1: 'single',
  2: 'random'
}

// 本地音乐和试用音乐列表
window.LS = store.collection('local')
window.TS = store.collection('temp')
//  音乐播放器
window.SONIST = new AudioPlayer()
window.LYRICS = new Lyrics()

let appInit = fs.cat(APP_INI_PATH)

Anot.ss('app-init', appInit + '')

appInit = JSON.parse(appInit)

const LRC_WIN = createDesktopLrcWindow(MAIN_SCREEN)
const MINI_WIN = createMiniWindow(MAIN_SCREEN, WIN)

WIN.hide()
MINI_WIN.show()

MINI_WIN.opener = WIN
MINI_WIN.openDevTools()

window.MINI_WIN = MINI_WIN
Anot({
  $id: 'app',
  state: {
    theme: appInit.theme || 1, // 1:macos, 2: deepin
    winFocus: false,
    mod: 'local',
    searchTxt: '',
    playMode: Anot.ls('play-mode') >>> 0, // 0:all | 1:single |  2:random
    ktvMode: 0,
    isPlaying: false,
    optBoxShow: false,
    volumeCtrlShow: false,
    volume: Anot.ls('volume') || 70,
    curr: {
      id: '',
      cover: '',
      title: '',
      artist: '',
      album: '',
      time: 0,
      duration: 0
    },
    ctrlLrc: '暂无歌词...',
    ...KTV.data,
    loading: false,
    progress: 0
  },
  skip: [],
  computed: {
    views() {
      if (!this.mod) {
        return
      }
      return '/views/' + this.mod + '.htm'
    },
    coverBG() {
      if (this.curr.cover) {
        return `url(${this.curr.cover})`
      } else {
        return 'none'
      }
    }
  },
  watch: {
    mod(val) {
      this.activeModule(val)
    }
  },
  mounted() {
    let canvas = this.$refs.player

    // 画布放大4倍, 以解决模糊的问题
    this.__WIDTH__ = canvas.clientWidth * 4
    this.__HEIGHT__ = canvas.clientHeight * 4

    canvas.width = this.__WIDTH__
    canvas.height = this.__HEIGHT__
    this.__CTX__ = canvas.getContext('2d')

    this.draw(true)

    // 修改歌曲进度
    canvas.addEventListener(
      'click',
      ev => {
        if (!this.curr.id) {
          return
        }
        let rect = canvas.getBoundingClientRect()
        let aw = rect.width
        let ax = ev.pageX - rect.left
        let ay = ev.pageY - rect.top

        if (ax < 80) {
          this.ktvMode = this.ktvMode ^ 1
          return
        }
        if (ax > 124 && ay > 55 && ay < 64) {
          let pp = (ax - 124) / (aw - 124)
          this.curr.time = pp * this.curr.duration
          SONIST.seek(this.curr.time)
          LYRICS.seek(this.curr.time)
          if (!this.isPlaying) {
            this.draw()
          }
        }
      },
      false
    )

    // 设置循环模式
    SONIST.mode = PLAY_MODE[this.playMode]
    SONIST.volume = this.volume

    SONIST.on('play', time => {
      this.curr.time = time
      LYRICS.update(time)
    })

    SONIST.on('end', time => {
      this.nextSong(1)
    })

    // 控制条的单行歌词
    LYRICS.on('ctrl-lrc', lrc => {
      this.ctrlLrc = lrc
    })

    // ktv模式的歌词
    LYRICS.on('ktv-lrc', lrc => {
      this.lrc = lrc
      LRC_WIN.emit('ktv-lrc', lrc)
    })

    // ktv模式的歌词
    LYRICS.on('view-all', lrc => {
      this.allLrc = lrc
    })

    this.activeModule(this.mod)

    remote.app.on('browser-window-focus', _ => {
      this.winFocus = true
    })
    remote.app.on('browser-window-blur', _ => {
      this.winFocus = false
    })
  },
  methods: {
    quit(force) {
      if (force) {
        remote.app.exit()
      } else {
        if (appInit.allowPlayOnBack) {
          WIN.hide()
        } else {
          remote.app.exit()
        }
      }
    },
    minimize() {
      WIN.minimize()
    },
    change2mini() {
      WIN.hide()
      MINI_WIN.show()
    },

    activeModule(mod) {
      switch (mod) {
        case 'artist':
          Artist.__init__()
          break
        case 'local':
          Local.__init__()
          break
        case 'profile':
          Profile.__init__()
          break
        case 'search':
          Search.__init__()
          break
        default:
          break
      }
    },

    toggleOptBox() {
      this.optBoxShow = !this.optBoxShow
    },
    toggleDesktopLrc() {
      if (LRC_WIN.isVisible()) {
        LRC_WIN.hide()
      } else {
        LRC_WIN.showInactive()
      }
    },
    toggleModule(mod) {
      if ('mv' === mod) {
        return
      }
      this.optBoxShow = false
      this.mod = mod
    },
    // 设置保存 回调
    onProfileSaved() {
      this.toggleModule('local')
      appInit = JSON.parse(Anot.ss('app-init'))
    },

    togglePlayMode() {
      let mod = this.playMode
      mod++
      if (mod > 2) {
        mod = 0
      }
      this.playMode = mod
      SONIST.mode = PLAY_MODE[mod]
      Anot.ls('play-mode', mod)
    },

    // 修改音量
    changeValume(ev) {
      let volume = 575 - ev.pageY
      if (volume < 0) {
        volume = 0
      }
      if (volume > 100) {
        volume = 100
      }
      this.volume = volume
      SONIST.volume = volume
      Anot.ls('volume', volume)
    },

    searchMusic(ev) {
      if (ev.keyCode === 13) {
        if (this.searchTxt === ':debug:') {
          log('-----  调试模式  -----')
          this.searchTxt = ''
          WIN.openDevTools()
        } else {
          layer.toast('搜索功能还未开放')
        }
      }
    },

    nextSong(step) {
      let _p = null
      if (step > 0) {
        _p = SONIST.next()
      } else {
        _p = SONIST.prev()
      }
      this.isPlaying = false
      _p.then(it => {
        if (this.mod === 'local') {
          Local.__updateSong__(it)
        }
        // 通知子模块歌曲已经改变
        this.$fire('child!curr', it.id)
        this.play(it)
      })
    },

    pause() {
      this.isPlaying = false
    },

    updateCurr(obj) {
      let old = this.curr.$model
      this.curr = Object.assign(old, obj)
    },

    play(song) {
      // 有参数的,说明是播放回调通知
      // 此时仅更新播放控制条的信息即可
      if (song) {
        song.time = 0
        this.ctrlLrc = '暂无歌词...'
        this.updateCurr(song)
        this.isPlaying = true
        this.draw(true)
        LYRICS.__init__(song.lyrics)
      } else {
        if (SONIST.stat === 'ready') {
          let played = this.isPlaying
          this.isPlaying = !this.isPlaying
          if (this.curr.id) {
            if (played) {
              SONIST.pause()
            } else {
              SONIST.play()
            }
            this.draw()
          } else {
            let lastPlay = Anot.ls('last-play') || 0
            SONIST.play(lastPlay).then(it => {
              it.time = 0
              this.ctrlLrc = '暂无歌词...'
              this.updateCurr(it)
              this.draw(true)
              // this.ktvMode = 1

              LYRICS.__init__(it.lyrics)
            })
          }
        }
      }
    },
    ...PLAYCTRL.methods,
    ...KTV.methods
  }
})
