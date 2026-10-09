const MAX_PHOTO_BYTES = 80 * 1024
const MAX_DIMENSION = 1280

function canvasBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Photo compression failed.'))
        return
      }
      resolve(blob)
    }, 'image/jpeg', quality)
  })
}

function blobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the compressed photo.'))
    reader.onload = () => resolve(reader.result)
    reader.readAsDataURL(blob)
  })
}

export async function compressLandingPhoto(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file.')
  }
  if (!('createImageBitmap' in window)) {
    throw new Error('This browser cannot compress photos. Please use a supported browser.')
  }
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Photo compression is unavailable on this device.')
    let scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    for (let resizeAttempt = 0; resizeAttempt < 4; resizeAttempt += 1) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      for (const quality of [0.82, 0.72, 0.62, 0.52, 0.42]) {
        const blob = await canvasBlob(canvas, quality)
        if (blob.size <= MAX_PHOTO_BYTES) return await blobAsDataUrl(blob)
      }
      scale *= 0.75
    }
    throw new Error('Photo is too detailed to compress to the 80 KB limit.')
  } finally {
    bitmap.close()
  }
}
