/**
 * Integration Credential Encryption
 *
 * Encrypts/decrypts integration connector credentials (API keys, passwords, tokens)
 * using AES-256-GCM. Credentials are stored encrypted in the database and only
 * decrypted at use time when a connector needs them.
 *
 * Requires CREDENTIALS_KEY env var (32-byte hex string = 64 hex chars).
 * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96 bits recommended for GCM
const TAG_LENGTH = 16 // 128 bits

function getKey(): Buffer {
  const hex = process.env.CREDENTIALS_KEY
  if (!hex) {
    throw new Error(
      'CREDENTIALS_KEY environment variable is required for credential encryption. ' +
      'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    )
  }
  if (hex.length !== 64) {
    throw new Error('CREDENTIALS_KEY must be a 64-character hex string (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

/**
 * Encrypt a credentials object to a single string for database storage.
 * Format: base64(iv + authTag + ciphertext)
 */
export function encryptCredentials(credentials: Record<string, unknown>): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const plaintext = JSON.stringify(credentials)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  // Pack: iv(12) + tag(16) + ciphertext(variable)
  const packed = Buffer.concat([iv, tag, encrypted])
  return packed.toString('base64')
}

/**
 * Decrypt a credentials string back to an object.
 * Returns the original credentials object.
 */
export function decryptCredentials(encrypted: string): Record<string, unknown> {
  const key = getKey()
  const packed = Buffer.from(encrypted, 'base64')

  if (packed.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('Invalid encrypted credentials: too short')
  }

  const iv = packed.subarray(0, IV_LENGTH)
  const tag = packed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const ciphertext = packed.subarray(IV_LENGTH + TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])

  return JSON.parse(decrypted.toString('utf8'))
}

/**
 * Check if a value looks like an encrypted credential string (base64).
 * Used to handle mixed encrypted/plaintext during migration.
 */
export function isEncrypted(value: unknown): boolean {
  if (typeof value !== 'string') return false
  if (value.length < 40) return false // minimum: base64 of iv+tag = ~37 chars
  try {
    const buf = Buffer.from(value, 'base64')
    return buf.length >= IV_LENGTH + TAG_LENGTH
  } catch {
    return false
  }
}

/**
 * Safely decrypt credentials, falling back to plaintext for unencrypted legacy data.
 * This allows gradual migration without breaking existing integrations.
 */
export function safeDecryptCredentials(config: unknown): Record<string, unknown> {
  // Already a plain object (legacy unencrypted)
  if (typeof config === 'object' && config !== null && !Array.isArray(config)) {
    // DEPRECATED: plaintext credential storage. Re-save the integration to encrypt it.
    // Encryption will be required once CREDENTIALS_KEY is mandatory in production.
    console.warn('[credentials] Using unencrypted (plaintext) credentials — re-save this integration to migrate to encrypted storage.')
    return config as Record<string, unknown>
  }

  // Encrypted string
  if (typeof config === 'string' && isEncrypted(config)) {
    return decryptCredentials(config)
  }

  // Fallback: empty config
  return {}
}
