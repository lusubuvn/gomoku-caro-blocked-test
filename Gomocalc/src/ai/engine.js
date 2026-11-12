import Worker from './engine-warpper.worker.js'
import { script } from '@/../node_modules/dynamic-import/dist/import.js'
import { threads } from 'wasm-feature-detect'

var callback, engineInstance, supportThreads, dataLoaded

function getWasmMemoryArguments(isShared, maximum_memory_mb = 2048) {
  return {
    initial: 64 * ((1024 * 1024) / 65536), // 64MB
    maximum: maximum_memory_mb * ((1024 * 1024) / 65536),
    shared: isShared,
  }
}

// Init engine and wait until the Worker reports that Rapfi is ready.
async function init(callbackFn_) {
  callback = callbackFn_
  dataLoaded = false
  supportThreads = false

  let canUseThreads = false
  try {
    canUseThreads =
      await threads() &&
      typeof window.crossOriginIsolated !== 'undefined' &&
      window.crossOriginIsolated === true &&
      typeof SharedArrayBuffer !== 'undefined'
  } catch (error) {
    canUseThreads = false
  }

  if (canUseThreads) {
    const engineURL = `${process.env.BASE_URL}build/rapfi-multi-simd128.js`

    try {
      await script.import(/* webpackIgnore: true */ engineURL)

      const engineDirURL = engineURL.substring(0, engineURL.lastIndexOf('/') + 1)

      const memory = new WebAssembly.Memory({
        initial: 64 * ((1024 * 1024) / 65536),
        maximum: 2048 * ((1024 * 1024) / 65536),
        shared: true,
      })

      const instance = await self['Rapfi']({
        locateFile: (url) => engineDirURL + url,
        onReceiveStdout: (o) => onEngineStdout(o),
        onReceiveStderr: (o) => onEngineStderr(o),
        onExit: (c) => onEngineExit(c),
        setStatus: (s) => onEngineStatus(s),
        wasmMemory: memory,
      })

      engineInstance = instance
      supportThreads = true
      dataLoaded = true
      callback({ ok: true, supportThreads: true })

      return engineURL
    } catch (error) {
      supportThreads = false
      engineInstance = null
      // eslint-disable-next-line no-console
      console.error('[Rapfi] Multi-thread initialization failed; using single-thread engine:', error)
    }
  }

  const engineURL = `${process.env.BASE_URL}build/rapfi-single-simd128.js`
  const worker = new Worker()
  engineInstance = worker

  return new Promise((resolve, reject) => {
    let settled = false

    const fail = (message) => {
      if (settled) return
      settled = true

      if (engineInstance === worker) engineInstance = null
      worker.terminate()

      const error = message instanceof Error
        ? message
        : new Error(String(message || 'Unknown engine Worker error'))

      callback({ error: error.message })
      reject(error)
    }

    worker.onmessage = (e) => {
      const { type, data } = e.data || {}

      if (type === 'stdout') onEngineStdout(data)
      else if (type === 'stderr') onEngineStderr(data)
      else if (type === 'exit') onEngineExit(data)
      else if (type === 'status') onEngineStatus(data)
      else if (type === 'error') fail(data || 'Engine Worker failed to load')
      else if (type === 'ready') {
        if (settled) return
        dataLoaded = true
        settled = true
        callback({ ok: true, supportThreads: false })
        resolve(engineURL)
      } else {
        // eslint-disable-next-line no-console
        console.error('received unknown message from worker: ', e.data)
      }
    }

    worker.onerror = (err) => {
      if (err && typeof err.preventDefault === 'function') {
        err.preventDefault()
      }
      fail(err && err.message ? err.message : 'Engine Worker failed')
    }

    worker.onmessageerror = () => {
      fail('Engine Worker returned an unreadable message')
    }

    try {
      worker.postMessage({
        type: 'engineScriptURL',
        data: {
          engineURL,
          memoryArgs: getWasmMemoryArguments(false),
        },
      })
    } catch (error) {
      fail(error)
    }
  })
}

// Stop current engine thinking and create a fresh single-thread Worker.
function stopThinking() {
  if (supportThreads) {
    sendCommand('YXSTOP')
    return false
  }

  if (engineInstance) {
    engineInstance.terminate()
    engineInstance = null
  }

  init(callback).catch((error) => {
// eslint-disable-next-line no-console
    console.error('Engine restart failed:', error)
  })
  return true
}

// Send a command to engine
function sendCommand(cmd) {
  if (typeof cmd !== 'string' || cmd.length == 0) return

  if (supportThreads) engineInstance.sendCommand(cmd)
  else if (engineInstance) engineInstance.postMessage({ type: 'command', data: cmd })
}

// process output from engine and call callback function
function onEngineStdout(output) {
  let i = output.indexOf(' ')

  if (i == -1) {
    if (output == 'OK') return
    else if (output == 'SWAP') callback({ swap: true })
    else {
      const coord = output.split(',')
      callback({ pos: [+coord[0], +coord[1]] })
    }
    return
  }

  let head = output.substring(0, i)
  let tail = output.substring(i + 1)

  if (head == 'MESSAGE') {
    if (tail.startsWith('REALTIME')) {
      let r = tail.split(' ')
      if (r.length < 3) {
        callback({
          realtime: {
            type: r[1],
          },
        })
      } else {
        let coord = r[2].split(',')
        callback({
          realtime: {
            type: r[1],
            pos: [+coord[0], +coord[1]],
          },
        })
      }
    } else {
      callback({ msg: tail })
    }
  } else if (head == 'INFO') {
    i = tail.indexOf(' ')
    head = tail.substring(0, i)
    tail = tail.substring(i + 1)

    if (head == 'PV') callback({ multipv: tail })
    else if (head == 'NUMPV') callback({ numpv: +tail })
    else if (head == 'DEPTH') callback({ depth: +tail })
    else if (head == 'SELDEPTH') callback({ seldepth: +tail })
    else if (head == 'NODES') callback({ nodes: +tail })
    else if (head == 'TOTALNODES') callback({ totalnodes: +tail })
    else if (head == 'TOTALTIME') callback({ totaltime: +tail })
    else if (head == 'SPEED') callback({ speed: +tail })
    else if (head == 'EVAL') callback({ eval: tail })
    else if (head == 'WINRATE') callback({ winrate: parseFloat(tail) })
    else if (head == 'BESTLINE')
      callback({ bestline: tail.match(/\d+,\d+/g).map((s) => s.split(',').map(Number)) })
  } else if (head == 'FORBID') {
    callback({
      forbid: (tail.match(/.{4}/g) || []).map((s) => {
        let coord = s.match(/([0-9][0-9])([0-9][0-9])/)
        let x = +coord[1]
        let y = +coord[2]
        return [x, y]
      }),
    })
  } else if (head == 'ERROR') {
    callback({ error: tail })
  } else if (head.indexOf(',') != -1) {
    const coord1 = head.split(',')
    const coord2 = tail.split(',')
    callback({
      pos: [+coord1[0], +coord1[1]],
      pos2: [+coord2[0], +coord2[1]],
    })
  } else {
    callback({ unknown: tail })
  }
}

function onEngineStderr(output) {
// eslint-disable-next-line no-console
  console.error('[Engine Error] ' + output)
}

function onEngineExit(code) {
// eslint-disable-next-line no-console
  console.log('[Engine Exit] ' + code)
}

function onEngineStatus(status) {
  if (dataLoaded) return

  if (status === 'Running...' || status === '') {
    dataLoaded = true
    callback({
      loading: {
        progress: 1.0,
      },
    })
  }

  const match = status.match(/\((\d+)\/(\d+)\)/)
  if (match) {
    const loadedBytes = parseInt(match[1], 10)
    const totalBytes = parseInt(match[2], 10)
    if (loadedBytes == totalBytes) dataLoaded = true
    callback({
      loading: {
        progress: loadedBytes / totalBytes,
        loadedBytes: loadedBytes,
        totalBytes: totalBytes,
      },
    })
  }
}

export { init, sendCommand, stopThinking }
