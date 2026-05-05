/**
 * One-line JSON log records, ingestible by Vercel + any external sink that
 * tails stdout. Use these instead of bare `console.log` so logs stay
 * structured and searchable.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogPayload {
  level: LogLevel
  ts: string
  scope: string
  msg: string
  /** Per-request correlation id when available. */
  requestId?: string
  /** Auth user id when available — already considered low-PII per our model. */
  userId?: string
  /** Free-form metadata; passes through PII scrubbing. */
  meta?: Record<string, unknown>
  /** Set on error rows. */
  error?: { name: string; message: string; stack?: string }
}

const PII_KEYS = new Set([
  'email',
  'token',
  'authorization_token',
  'authorization',
  'cookie',
  'signature',
  'valency_token',
  'valency_token_cipher',
  'password',
])

/**
 * Recursively redacts known PII-bearing keys. Best-effort — we still avoid
 * passing raw secrets into log meta in the first place.
 */
export function scrub(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map(scrub)
  if (typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (PII_KEYS.has(k.toLowerCase())) {
      out[k] = '[redacted]'
    } else {
      out[k] = scrub(v)
    }
  }
  return out
}

function emit(payload: LogPayload) {
  const json = JSON.stringify(payload)
  switch (payload.level) {
    case 'error':
      console.error(json)
      break
    case 'warn':
      console.warn(json)
      break
    case 'debug':
      console.debug(json)
      break
    default:
      console.info(json)
  }
}

export interface LogOptions {
  scope: string
  msg: string
  requestId?: string
  userId?: string
  meta?: Record<string, unknown>
  error?: unknown
}

function build(level: LogLevel, opts: LogOptions): LogPayload {
  const payload: LogPayload = {
    level,
    ts: new Date().toISOString(),
    scope: opts.scope,
    msg: opts.msg,
  }
  if (opts.requestId) payload.requestId = opts.requestId
  if (opts.userId) payload.userId = opts.userId
  if (opts.meta) payload.meta = scrub(opts.meta) as Record<string, unknown>
  if (opts.error instanceof Error) {
    payload.error = {
      name: opts.error.name,
      message: opts.error.message,
      stack: opts.error.stack,
    }
  } else if (opts.error) {
    payload.error = { name: 'unknown', message: String(opts.error) }
  }
  return payload
}

export const log = {
  debug: (opts: LogOptions) => emit(build('debug', opts)),
  info: (opts: LogOptions) => emit(build('info', opts)),
  warn: (opts: LogOptions) => emit(build('warn', opts)),
  error: (opts: LogOptions) => emit(build('error', opts)),
}
