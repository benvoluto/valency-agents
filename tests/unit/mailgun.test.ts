import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { verifyMailgunSignature, sendViaMailgun } from '@/lib/email/mailgun'
import { createHmac } from 'node:crypto'

const SIGNING_KEY = 'test-signing-key-do-not-use'
const ORIG = { ...process.env }

beforeAll(() => {
  process.env.MAILGUN_API_KEY = 'key-test'
  process.env.MAILGUN_DOMAIN = 'mg.test'
  process.env.MAILGUN_FROM_EMAIL = 'agents@mg.test'
  process.env.MAILGUN_BASE_URL = 'https://api.test.mailgun.example'
})
afterAll(() => {
  process.env = { ...ORIG }
})

function signLikeMailgun(token: string, timestamp: string, key: string) {
  return createHmac('sha256', key).update(`${timestamp}${token}`).digest('hex')
}

describe('verifyMailgunSignature', () => {
  it('accepts a valid signature', async () => {
    const timestamp = '1700000000'
    const token = 'sample-token-abc'
    const signature = signLikeMailgun(token, timestamp, SIGNING_KEY)
    const ok = await verifyMailgunSignature(
      { token, timestamp, signature },
      SIGNING_KEY,
    )
    expect(ok).toBe(true)
  })

  it('rejects a tampered signature', async () => {
    const timestamp = '1700000000'
    const token = 'sample-token-abc'
    let signature = signLikeMailgun(token, timestamp, SIGNING_KEY)
    signature = signature.replace(/.$/, (c) => (c === '0' ? '1' : '0'))
    const ok = await verifyMailgunSignature(
      { token, timestamp, signature },
      SIGNING_KEY,
    )
    expect(ok).toBe(false)
  })

  it('rejects when fields are missing', async () => {
    const ok = await verifyMailgunSignature(
      { token: '', timestamp: '0', signature: '' },
      SIGNING_KEY,
    )
    expect(ok).toBe(false)
  })
})

describe('sendViaMailgun', () => {
  it('retries on 5xx and succeeds on second attempt', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls++
      if (calls === 1) {
        return new Response('boom', { status: 503 })
      }
      return new Response(
        JSON.stringify({ id: 'mailgun-id-1', message: 'Queued. Thank you.' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch
    const result = await sendViaMailgun(
      {
        to: 'a@b.test',
        subject: 's',
        html: '<p>h</p>',
        text: 't',
      },
      { fetchImpl },
    )
    expect(result.id).toBe('mailgun-id-1')
    expect(calls).toBe(2)
  })

  it('does not retry on 4xx', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls++
      return new Response('bad request', { status: 400 })
    }) as typeof fetch
    await expect(
      sendViaMailgun(
        {
          to: 'a@b.test',
          subject: 's',
          html: '<p>h</p>',
          text: 't',
        },
        { fetchImpl },
      ),
    ).rejects.toThrow(/400/)
    expect(calls).toBe(1)
  })
})
