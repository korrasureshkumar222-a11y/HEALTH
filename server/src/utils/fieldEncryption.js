import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { env } from '../config/env.js'
import ApiError from './ApiError.js'

const prefix = 'enc:v1:'

function encryptionKey() {
  if (env.piiEncryptionKey) return Buffer.from(env.piiEncryptionKey, 'base64')
  if (env.nodeEnv !== 'production' && env.jwtAccessSecret) {
    return createHash('sha256').update(env.jwtAccessSecret).digest()
  }
  throw new ApiError(503, 'Sensitive data encryption is not configured.', 'ENCRYPTION_NOT_CONFIGURED')
}

export function encryptSensitiveField(value) {
  if (value == null) return value
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return `${prefix}${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`
}

export function decryptSensitiveField(value) {
  if (value == null || typeof value !== 'string' || !value.startsWith(prefix)) return value
  const [ivText, tagText, ciphertextText] = value.slice(prefix.length).split(':')
  if (!ivText || !tagText || !ciphertextText) {
    throw new Error('Encrypted patient field has an invalid envelope.')
  }
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      encryptionKey(),
      Buffer.from(ivText, 'base64'),
    )
    decipher.setAuthTag(Buffer.from(tagText, 'base64'))
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, 'base64')),
      decipher.final(),
    ]).toString('utf8')
    return JSON.parse(plaintext)
  } catch (error) {
    throw new Error('Encrypted patient field failed authentication.', { cause: error })
  }
}
