var EngineInstance = null
var pendingCommands = []

function locateFile(url, engineDirURL) {
  if (/^rapfi.*\.data$/.test(url)) url = 'rapfi.data'
  return engineDirURL + url
}

self.onmessage = function (e) {
  const { type, data } = e.data || {}

  if (type === 'command') {
    if (EngineInstance) {
      EngineInstance.sendCommand(data)
    } else {
      pendingCommands.push(data)
    }
  } else if (type === 'engineScriptURL') {
    const { engineURL, memoryArgs } = data
    const engineDirURL = engineURL.substring(0, engineURL.lastIndexOf('/') + 1)

    try {
      self.importScripts(engineURL)

      Promise.resolve(self['Rapfi']({
        locateFile: (url) => locateFile(url, engineDirURL),
        onReceiveStdout: (o) => self.postMessage({ type: 'stdout', data: o }),
        onReceiveStderr: (o) => self.postMessage({ type: 'stderr', data: o }),
        onExit: (c) => self.postMessage({ type: 'exit', data: c }),
        setStatus: (s) => self.postMessage({ type: 'status', data: s }),
        wasmMemory: memoryArgs ? new WebAssembly.Memory(memoryArgs) : undefined,
      })).then((instance) => {
        EngineInstance = instance
        self.postMessage({ type: 'ready' })
        pendingCommands.splice(0).forEach((command) => {
          EngineInstance.sendCommand(command)
        })
      }).catch((error) => {
        self.postMessage({
          type: 'error',
          data: error && error.message ? error.message : String(error),
        })
      })
    } catch (error) {
      self.postMessage({
        type: 'error',
        data: error && error.message ? error.message : String(error),
      })
    }
  } else {
    console.error('worker received unknown payload:', type)
  }
}
