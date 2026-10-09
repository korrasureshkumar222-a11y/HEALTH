const JPEG_PREFIX = 'data:image/jpeg;base64,'
const MAX_PHOTO_BYTES = 80 * 1024
const MAX_DATA_URL_LENGTH = JPEG_PREFIX.length + Math.ceil(MAX_PHOTO_BYTES / 3) * 4

export function isLandingPhoto(value) {
  if (typeof value !== 'string') return false
  if (value.startsWith('https://') || value.startsWith('http://')) {
    return value.length <= 2048
  }
  if (!value.startsWith(JPEG_PREFIX) || value.length > MAX_DATA_URL_LENGTH) return false
  const encoded = value.slice(JPEG_PREFIX.length)
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    return false
  }
  const bytes = Buffer.from(encoded, 'base64')
  return bytes.length >= 4
    && bytes.length <= MAX_PHOTO_BYTES
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[bytes.length - 2] === 0xff
    && bytes[bytes.length - 1] === 0xd9
}
