/**
 * In-memory token-bucket rate limit, keyed by user. Sufficient for Phase 3 dev
 * (each Vercel invocation may see only a slice of traffic, but a misbehaving
 * caller will still be slowed within a single warm worker).
 *
 * Phase 13 will replace this with a Redis-backed limiter shared across
 * regions and invocations.
 */

interface Bucket {
  tokens: number
  lastRefill: number
}

const DEFAULT_CAPACITY = 60
const DEFAULT_REFILL_PER_MS = 60 / 60_000 // 60 tokens per minute

const buckets = new Map<string, Bucket>()

function refill(b: Bucket, capacity: number, refillPerMs: number, now: number) {
  const elapsed = now - b.lastRefill
  if (elapsed <= 0) return
  b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerMs)
  b.lastRefill = now
}

/**
 * Reserve one token for `key`. Returns the wait time in ms (0 if immediately
 * available). Caller should `await` and retry-spin if `wait > 0`.
 */
export function reserveToken(
  key: string,
  opts: { capacity?: number; refillPerMs?: number } = {},
): number {
  const capacity = opts.capacity ?? DEFAULT_CAPACITY
  const refillPerMs = opts.refillPerMs ?? DEFAULT_REFILL_PER_MS
  const now = Date.now()
  const b = buckets.get(key) ?? { tokens: capacity, lastRefill: now }
  refill(b, capacity, refillPerMs, now)
  if (b.tokens >= 1) {
    b.tokens -= 1
    buckets.set(key, b)
    return 0
  }
  // Need to wait until 1 full token regenerates.
  const waitMs = Math.ceil((1 - b.tokens) / refillPerMs)
  buckets.set(key, b)
  return waitMs
}

export function __resetRateLimitForTests() {
  buckets.clear()
}
