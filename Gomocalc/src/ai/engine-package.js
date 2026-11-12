const packagePromises = new Map()

export function loadRapfiPackage(engineDirURL, manifestName) {
  const manifestURL = engineDirURL + manifestName

  if (!packagePromises.has(manifestURL)) {
    const promise = (async () => {
      const manifestResponse = await fetch(manifestURL, { cache: 'force-cache' })
      if (!manifestResponse.ok) {
        throw new Error(
          `Unable to load Rapfi NNUE manifest (${manifestResponse.status}): ${manifestURL}`
        )
      }

      const manifest = await manifestResponse.json()
      if (
        !Number.isSafeInteger(manifest.size) ||
        manifest.size <= 0 ||
        !Array.isArray(manifest.parts) ||
        manifest.parts.length === 0
      ) {
        throw new Error('Invalid Rapfi NNUE package manifest')
      }

      const chunks = await Promise.all(
        manifest.parts.map(async (part) => {
          const response = await fetch(engineDirURL + part, { cache: 'force-cache' })
          if (!response.ok) {
            throw new Error(`Unable to load Rapfi NNUE chunk ${part} (${response.status})`)
          }
          return response.arrayBuffer()
        })
      )

      const packageBytes = new Uint8Array(manifest.size)
      let offset = 0

      for (const chunk of chunks) {
        if (offset + chunk.byteLength > packageBytes.byteLength) {
          throw new Error('Rapfi NNUE chunks exceed the declared package size')
        }
        packageBytes.set(new Uint8Array(chunk), offset)
        offset += chunk.byteLength
      }

      if (offset !== packageBytes.byteLength) {
        throw new Error(
          `Rapfi NNUE package is incomplete: expected ${packageBytes.byteLength}, received ${offset}`
        )
      }

      return packageBytes.buffer
    })()

    packagePromises.set(manifestURL, promise)
    promise.catch(() => packagePromises.delete(manifestURL))
  }

  return packagePromises.get(manifestURL)
}
