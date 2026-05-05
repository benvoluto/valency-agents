import { webcrypto } from 'node:crypto'

const subtle = webcrypto.subtle

let cachedKey: CryptoKey | null = null

async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey
  const raw = process.env.BRIEFING_ENC_KEY
  if (!raw) {
    throw new Error('BRIEFING_ENC_KEY is not set')
  }
  // Accept either a 64-char hex string or a base64-encoded 32-byte value.
  let bytes: Uint8Array
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    bytes = new Uint8Array(
      raw.match(/.{2}/g)!.map((h) => parseInt(h, 16)),
    )
  } else {
    bytes = Uint8Array.from(Buffer.from(raw, 'base64'))
    if (bytes.length !== 32) {
      throw new Error(
        'BRIEFING_ENC_KEY must be 32 bytes — supply 64 hex chars or base64 of 32 bytes.',
      )
    }
  }
  cachedKey = await subtle.importKey('raw', bytes, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
  return cachedKey
}

/** Encrypts plaintext with AES-256-GCM. Returns `iv:ciphertext` base64url. */
export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await getKey()
  const iv = webcrypto.getRandomValues(new Uint8Array(12))
  const enc = new TextEncoder().encode(plaintext)
  const cipher = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc),
  )
  return `${toB64Url(iv)}.${toB64Url(cipher)}`
}

/** Inverse of `encryptSecret`. Throws on tampering. */
export async function decryptSecret(packed: string): Promise<string> {
  const [ivPart, cipherPart] = packed.split('.')
  if (!ivPart || !cipherPart) {
    throw new Error('Malformed ciphertext envelope')
  }
  const key = await getKey()
  const iv = fromB64Url(ivPart)
  const cipher = fromB64Url(cipherPart)
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher)
  return new TextDecoder().decode(plain)
}

function toB64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url')
}

function fromB64Url(s: string): Uint8Array {
  return Uint8Array.from(Buffer.from(s, 'base64url'))
}
