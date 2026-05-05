/**
 * In-memory token-bucket rate limiter, keyed by named bucket config + key.
 * Each Vercel invocation has its own copy, but a misbehaving caller will
 * still be slowed within a single warm worker. Phase 13+ swaps this with
 * Redis for cross-region coordination.
 */

interface Bucket {
  tokens: number
  lastRefill: number
}

interface BucketConfig {
  /** Maximum tokens the bucket can hold. */
  capacity: number
  /** Tokens regenerated per millisecond. */
  refillPerMs: number
}

export const BUCKETS = {
  /** Valency MCP traffic — 60/min/user. */
  valency: { capacity: 60, refillPerMs: 60 / 60_000 },
  /** Chat stream POSTs — 20/min/user. Each turn is paid + multi-second. */
  chat: { capacity: 20, refillPerMs: 20 / 60_000 },
  /** Briefing action handler — 60/min/user. */
  action: { capacity: 60, refillPerMs: 60 / 60_000 },
  /** Inbound mailgun webhook — 30/min/sender. Generous; Mailgun retries. */
  inbound: { capacity: 30, refillPerMs: 30 / 60_000 },
} as const satisfies Record<string, BucketConfig>

export type BucketName = keyof typeof BUCKETS

const buckets = new Map<string, Bucket>()

function refill(b: Bucket, cfg: BucketConfig, now: number) {
  const elapsed = now - b.lastRefill
  if (elapsed <= 0) return
  b.tokens = Math.min(cfg.capacity, b.tokens + elapsed * cfg.refillPerMs)
  b.lastRefill = now
}

/**
 * Reserve one token for `key` from the named bucket. Returns 0 when allowed
 * immediately, or a positive ms wait when the caller should back off.
 */
export function reserveToken(bucket: BucketName, key: string): number {
  const cfg = BUCKETS[bucket]
  const now = Date.now()
  const id = `${bucket}:${key}`
  const b = buckets.get(id) ?? { tokens: cfg.capacity, lastRefill: now }
  refill(b, cfg, now)
  if (b.tokens >= 1) {
    b.tokens -= 1
    buckets.set(id, b)
    return 0
  }
  const waitMs = Math.ceil((1 - b.tokens) / cfg.refillPerMs)
  buckets.set(id, b)
  return waitMs
}

/**
 * Convenience: returns a `Response` with 429 + Retry-After when over the
 * limit, otherwise null. Apps can `if (over) return over;` at the top of
 * a route handler.
 */
export function rateLimit(bucket: BucketName, key: string): Response | null {
  const wait = reserveToken(bucket, key)
  if (wait === 0) return null
  return Response.json(
    { error: 'rate limit exceeded', retryAfterMs: wait },
    { status: 429, headers: { 'Retry-After': String(Math.ceil(wait / 1000)) } },
  )
}

export function __resetRateLimitForTests() {
  buckets.clear()
}
