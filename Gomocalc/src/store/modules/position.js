import { STANDARD, RENJU } from './settings'

const EMPTY = 0,
  BLACK = 1,
  WHITE = 2

function toIndex(p, size) {
  if (p[0] < 0 || p[1] < 0 || p[0] >= size || p[1] >= size) return -1
  else return p[1] * size + p[0]
}

function checkLine(board, pos, delta, size, exactFive = false, blockedTwoEnds = false, blocked = []) {
  let piece = board[toIndex(pos, size)]
  let count = 1,
    i,
    j
  for (i = 1; ; i++) {
    let x = pos[0] + delta[0] * i
    let y = pos[1] + delta[1] * i
    let index = toIndex([x, y], size)
    if (index == -1) break
    if (board[index] == piece) count++
    else break
  }
  for (j = 1; ; j++) {
    let x = pos[0] - delta[0] * j
    let y = pos[1] - delta[1] * j
    let index = toIndex([x, y], size)
    if (index == -1) break
    if (board[index] == piece) count++
    else break
  }

  if (blockedTwoEnds && count == 5) {
    const leftIndex = toIndex(
      [pos[0] - delta[0] * j, pos[1] - delta[1] * j], size
    )
    const rightIndex = toIndex(
      [pos[0] + delta[0] * i, pos[1] + delta[1] * i], size
    )
    const leftPos = [
      pos[0] - delta[0] * j,
      pos[1] - delta[1] * j,
    ]
    const rightPos = [
      pos[0] + delta[0] * i,
      pos[1] + delta[1] * i,
    ]

    const leftBlocked = leftIndex != -1 && (
      board[leftIndex] != EMPTY ||
      blocked.some(p => p[0] == leftPos[0] && p[1] == leftPos[1])
    )
    const rightBlocked = rightIndex != -1 && (
      board[rightIndex] != EMPTY ||
      blocked.some(p => p[0] == rightPos[0] && p[1] == rightPos[1])
    )

    if (leftBlocked && rightBlocked) return
  }

  if (exactFive ? count == 5 : count >= 5) return [1 - j, i - 1]
}

const state = {
  size: 15,
  board: null,
  position: [],
  blocked: [],
  /* 棋子序列数组,每个元素为一个表示坐标的二维向量[x, y] */
  lastPosition: [],
  winline: [],
  swaped: false,
}

const getters = {
  posStr: (state) => {
    let posStrs = []
    for (let p of state.position) {
      posStrs.push(String.fromCharCode('a'.charCodeAt(0) + p[0]))
      posStrs.push(state.size - p[1])
    }
    return posStrs.join('')
  },
  get: (state) => {
    return (pos) => {
      switch (state.board[toIndex(pos, state.size)]) {
        case BLACK:
          return 'BLACK'
        case WHITE:
          return 'WHITE'
        case EMPTY:
          return 'EMPTY'
        default:
          return 'ERROR'
      }
    }
  },
  isBlocked: (state) => {
    return (pos) => state.blocked.some(
      p => p[0] == pos[0] && p[1] == pos[1]
    )
  },
  isEmpty: (state, getters) => {
    return (pos) => {
      return state.board[toIndex(pos, state.size)] == EMPTY &&
        !getters.isBlocked(pos)
    }
  },
  isInBoard: (state) => {
    return (pos) => {
      return toIndex(pos, state.size) != -1
    }
  },
  playerToMove: (state) => {
    return state.position.length % 2 == 0 ? 'BLACK' : 'WHITE'
  },
  moveLeftCount: (state) => {
    return state.size * state.size - state.position.length - state.blocked.length
  },
  marchPosition: (state) => {
    return (position) => {
      let len = Math.min(position.length, state.position)
      let i = 0
      for (; i < len; i++) {
        let pos1 = position[i]
        let pos2 = state.position[i]
        if (pos1[0] != pos2[0] || pos1[1] != pos2[1]) break
      }
      return i
    }
  },
}

const mutations = {
  new(state, size) {
    state.size = size
    state.board = new Uint8Array(state.size * state.size).fill(EMPTY)
    state.lastPosition = []
    state.position = []
    state.blocked = []
    state.winline = []
    state.swaped = false
  },
  toggleBlocked(state, pos) {
    const index = state.blocked.findIndex(
      p => p[0] == pos[0] && p[1] == pos[1]
    )
    if (index >= 0) state.blocked.splice(index, 1)
    else state.blocked.push([...pos])
  },
  clearBlocked(state) {
    state.blocked = []
  },
  move(state, pos) {
    state.board[pos[1] * state.size + pos[0]] = state.position.length % 2 == 0 ? BLACK : WHITE
    state.position.push(pos)

    let lastPos = state.lastPosition[state.position.length - 1]
    if (!lastPos || lastPos[0] != pos[0] || lastPos[1] != pos[1]) {
      state.lastPosition = [...state.position] // 走向不同的分支
    }
  },
  undo(state) {
    let pos = state.position.pop()
    state.board[pos[1] * state.size + pos[0]] = EMPTY
    state.winline = []
  },
  checkWin(state, options = {}) {
    if (state.position.length < 9) return

    const checkOverline =
      typeof options == 'boolean' ? options : !!options.checkOverline
    const blockedTwoEnds =
      typeof options == 'object' && !!options.blockedTwoEnds

    let lastPos = state.position[state.position.length - 1]
    const dirs = [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ]
    for (let dir of dirs) {
      let ret = checkLine(
        state.board, lastPos, dir, state.size,
        checkOverline, blockedTwoEnds, state.blocked
      )
      if (ret) {
        return (state.winline = [
          [lastPos[0] + ret[0] * dir[0], lastPos[1] + ret[0] * dir[1]],
          [lastPos[0] + ret[1] * dir[0], lastPos[1] + ret[1] * dir[1]],
        ])
      }
    }
  },
  setSwaped(state) {
    state.swaped = true
  },
}

const actions = {
  setPosStr({ commit, dispatch, getters, state }, str) {
    str = str.trim().toLowerCase()
    let posArray = str.match(/([a-z])(\d+)/g)
    if (getters.posStr == str) return

    commit('new', state.size)
    if (!posArray) return
    for (let p of posArray) {
      let x = p.match(/[a-z]/)[0].charCodeAt(0) - 'a'.charCodeAt(0)
      let y = state.size - +p.match(/\d+/)[0]
      dispatch('makeMove', [x, y])
      if (state.winline.length > 0) break
    }
  },
  toggleBlocked({ commit, dispatch, getters, state }, pos) {
    if (state.board[ toIndex(pos, state.size) ] != EMPTY &&
        !getters.isBlocked(pos)) return false
    if (!getters.isInBoard(pos)) return false

    commit('toggleBlocked', pos)
    dispatch('ai/syncBlocks', {}, { root: true })
    return true
  },
  clearBlocked({ commit, dispatch }) {
    commit('clearBlocked')
    dispatch('ai/syncBlocks', {}, { root: true })
  },
  makeMove({ commit, dispatch, getters, rootGetters, rootState }, pos) {
    if (!getters.isEmpty(pos)) return false
    let checkOverline =
      rootGetters['settings/gameRule'] == STANDARD ||
      (rootGetters['settings/gameRule'] == RENJU && getters.playerToMove == 'BLACK')
    const blockedTwoEnds =
      rootState.settings.blockedRule && rootGetters['settings/gameRule'] == 0
    commit('move', pos)
    commit('checkWin', { checkOverline, blockedTwoEnds })
    dispatch('ai/checkForbid', {}, { root: true })
    return true
  },
  backward({ commit, dispatch }) {
    if (state.position.length == 0) return
    commit('undo')
    dispatch('ai/checkForbid', {}, { root: true })
  },
  forward({ commit, dispatch, state, getters, rootGetters, rootState }) {
    if (state.lastPosition.length <= state.position.length) return
    let checkOverline =
      rootGetters['settings/gameRule'] == STANDARD ||
      (rootGetters['settings/gameRule'] == RENJU && getters.playerToMove == 'BLACK')
    const blockedTwoEnds =
      rootState.settings.blockedRule && rootGetters['settings/gameRule'] == 0
    commit('move', state.lastPosition[state.position.length])
    commit('checkWin', { checkOverline, blockedTwoEnds })
    dispatch('ai/checkForbid', {}, { root: true })
  },
  backToBegin({ dispatch, state }) {
    while (state.position.length > 0) {
      dispatch('backward')
    }
  },
  forwardToEnd({ dispatch, state }) {
    while (state.lastPosition.length > state.position.length) dispatch('forward')
  },
  rotate({ commit, dispatch, state }) {
    let position = state.position.map(p => [...p])
    let blocked = state.blocked.map(p => [...p])
    const size = state.size

    commit('new', size)

    for (let p of position) {
      dispatch('makeMove', [size - 1 - p[1], p[0]])
    }

    for (let p of blocked) {
      commit('toggleBlocked', [size - 1 - p[1], p[0]])
    }

    dispatch('ai/syncBlocks', {}, { root: true })
  },
  flip({ commit, dispatch, state }, dir) {
    const size = state.size
    const transform = (p) => {
      if (dir[0] == 0 && dir[1] == 0) return [p[1], p[0]]
      if (dir[0] == 1 && dir[1] == 1) {
        return [size - 1 - p[1], size - 1 - p[0]]
      }
      if (dir[0] == 1) return [size - 1 - p[0], p[1]]
      if (dir[1] == 1) return [p[0], size - 1 - p[1]]
      return [...p]
    }

    const position = state.position.map(transform)
    const blocked = state.blocked.map(transform)

    commit('new', size)

    for (let p of position) {
      dispatch('makeMove', p)
    }

    for (let p of blocked) {
      commit('toggleBlocked', p)
    }

    dispatch('ai/syncBlocks', {}, { root: true })
  },
  moveTowards({ commit, dispatch, state }, dir) {
    const size = state.size
    const position = state.position.map(p => [...p])
    const blocked = state.blocked.map(p => [...p])

    commit('new', size)

    for (let p of position) {
      dispatch('makeMove', [p[0] + dir[0], p[1] + dir[1]])
    }

    for (let p of blocked) {
      const next = [p[0] + dir[0], p[1] + dir[1]]
      if (next[0] >= 0 && next[0] < size &&
          next[1] >= 0 && next[1] < size) {
        commit('toggleBlocked', next)
      }
    }

    dispatch('ai/syncBlocks', {}, { root: true })
  },
}

export default {
  namespaced: true,
  state,
  getters,
  actions,
  mutations,
}
