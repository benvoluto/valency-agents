/**
 * Re-export the generic limiter so existing valency callers keep working.
 * The legacy default arg shape (`reserveToken(key, opts)`) is not preserved
 * — the only call site is the Valency client, which we update in lockstep.
 */
export { reserveToken, __resetRateLimitForTests } from '@/lib/rate-limit'
