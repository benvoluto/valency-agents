/**
 * Thin Mailgun REST client. We don't pull in `mailgun.js` because we only
 * need messages.send and HMAC-verified webhook ingestion — both are tiny.
 */

const MAX_ATTEMPTS = 3
const BACKOFF_MS = [200, 800, 2400]

export interface MailgunSendInput {
  to: string
  subject: string
  html: string
  text: string
  /** Reply-To plus any custom header values like X-Mailgun-Variables. */
  headers?: Record<string, string>
  /** Idempotency key — sent as X-Mailgun-Variables for ingest correlation. */
  idempotencyKey?: string
  /** Verbose tags for the Mailgun analytics dashboard. */
  tags?: string[]
}

export interface MailgunSendResult {
  id: string
  message: string
}

export class MailgunError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retriable = false,
  ) {
    super(message)
    this.name = 'MailgunError'
  }
}

export async function sendViaMailgun(
  input: MailgunSendInput,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<MailgunSendResult> {
  const apiKey = process.env.MAILGUN_API_KEY
  const domain = process.env.MAILGUN_DOMAIN
  const baseUrl = process.env.MAILGUN_BASE_URL ?? 'https://api.mailgun.net'
  const from = process.env.MAILGUN_FROM_EMAIL
  if (!apiKey || !domain || !from) {
    throw new MailgunError(
      'Mailgun not configured (MAILGUN_API_KEY/DOMAIN/FROM_EMAIL)',
    )
  }

  const fetchImpl = opts.fetchImpl ?? fetch
  const url = `${baseUrl}/v3/${domain}/messages`
  const body = new URLSearchParams()
  body.set('from', from)
  body.set('to', input.to)
  body.set('subject', input.subject)
  body.set('html', input.html)
  body.set('text', input.text)
  if (input.headers) {
    for (const [k, v] of Object.entries(input.headers)) {
      body.set(`h:${k}`, v)
    }
  }
  if (input.idempotencyKey) {
    body.set(
      'v:idempotencyKey',
      input.idempotencyKey,
    )
  }
  if (input.tags && input.tags.length > 0) {
    for (const t of input.tags) body.append('o:tag', t)
  }
  body.set('o:tracking', 'yes')

  let lastError: Error | undefined
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(BACKOFF_MS[attempt - 1] ?? 1000)
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      })
      if (res.ok) {
        const data = (await res.json()) as MailgunSendResult
        return data
      }
      const text = await res.text().catch(() => '')
      const retriable = res.status >= 500 || res.status === 429
      const err = new MailgunError(
        `Mailgun HTTP ${res.status}: ${text.slice(0, 200)}`,
        res.status,
        retriable,
      )
      lastError = err
      if (!retriable) throw err
    } catch (err) {
      lastError = err as Error
      if (err instanceof MailgunError && !err.retriable) throw err
    }
  }
  throw lastError ?? new MailgunError('send failed without error')
}

/**
 * Verifies a Mailgun webhook signature per
 * https://documentation.mailgun.com/docs/mailgun/user-manual/tracking-messages/#securing-webhooks .
 */
export async function verifyMailgunSignature(
  signature: { token: string; timestamp: string; signature: string },
  signingKey: string,
): Promise<boolean> {
  if (!signature.token || !signature.timestamp || !signature.signature) {
    return false
  }
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(signingKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const data = enc.encode(`${signature.timestamp}${signature.token}`)
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, data))
  const expected = Buffer.from(sig).toString('hex')
  return timingSafeEqual(expected, signature.signature)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
