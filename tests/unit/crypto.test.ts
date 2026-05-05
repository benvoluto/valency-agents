import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret } from '@/lib/crypto'

const ORIGINAL = process.env.BRIEFING_ENC_KEY

beforeAll(() => {
  // 32 bytes of zeros, hex-encoded.
  process.env.BRIEFING_ENC_KEY = '0'.repeat(64)
})

afterAll(() => {
  process.env.BRIEFING_ENC_KEY = ORIGINAL
})

describe('crypto', () => {
  it('round-trips a string', async () => {
    const cipher = await encryptSecret('vlnc_secret_token')
    expect(cipher).not.toContain('vlnc_secret_token')
    expect(cipher.split('.')).toHaveLength(2)
    expect(await decryptSecret(cipher)).toBe('vlnc_secret_token')
  })

  it('produces different ciphertexts for the same plaintext (random IV)', async () => {
    const a = await encryptSecret('hello')
    const b = await encryptSecret('hello')
    expect(a).not.toBe(b)
    expect(await decryptSecret(a)).toBe('hello')
    expect(await decryptSecret(b)).toBe('hello')
  })

  it('rejects tampered ciphertext', async () => {
    const cipher = await encryptSecret('hello')
    const [iv, ct] = cipher.split('.')
    const flipped = `${iv}.${ct.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'))}`
    await expect(decryptSecret(flipped)).rejects.toThrow()
  })
})
