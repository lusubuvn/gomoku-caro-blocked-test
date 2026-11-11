import Vue from 'vue'
import Vuex from 'vuex'
import ai from './modules/ai'
import position from './modules/position'
import settings from './modules/settings'
import { simd } from 'wasm-feature-detect'

Vue.use(Vuex)

export default new Vuex.Store({
  modules: {
    ai,
    position,
    settings,
  },
  state: {
    screenWidth: document.documentElement.clientWidth, // 屏幕宽度
    screenHeight: document.documentElement.clientHeight, // 屏幕高度
    isOnIOSBrowser:
      (/iPad|iPhone|iPod/.test(navigator.platform) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) &&
      !window.MSStream,
    maxThreads: 1,
    supportThreads: false,
    supportSimd: false,
    supportRelaxedSimd: false,
  },
  getters: {
    boardCanvasWidth(state) {
      const MinBoardWidth = 300
      const BottomPadding = 200
      return Math.max(
        Math.min(state.screenWidth, state.screenHeight - BottomPadding),
        MinBoardWidth
      )
    },
  },
  mutations: {
    setScreenSize(state, payload) {
      state.screenWidth = payload.width
      state.screenHeight = payload.height
    },
    setBrowserCapability(state, { maxThreads, supportThreads, supportSimd, supportRelaxedSimd }) {
      state.maxThreads = maxThreads
      state.supportThreads = supportThreads
      state.supportSimd = supportSimd
      state.supportRelaxedSimd = supportRelaxedSimd
    },
  },
  actions: {
    async getBrowserCapabilities({ commit }) {
      const supportSimd = await simd()

      // The deployed Rapfi build is single-thread SIMD only.
      commit('setBrowserCapability', {
        maxThreads: 1,
        supportThreads: false,
        supportSimd,
        supportRelaxedSimd: false,
      })

      return supportSimd
    },
  },
  strict: process.env.NODE_ENV !== 'production',
})
