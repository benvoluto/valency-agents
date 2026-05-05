import { db } from '@/db'
import { credentials } from '@/db/schema'
import { decryptSecret } from '@/lib/crypto'
import { eq } from 'drizzle-orm'
import {
  ValencyClient,
  type StepRecorder,
  type ValencyClientOptions,
} from './client'

export * from './client'
export * from './tools'

/**
 * Resolves the Valency bearer token to use for a given user. Prefers the
 * user's stored token (decrypted from `credentials`), falls back to the
 * shared system token in env. Returns null if neither is available.
 */
export async function getValencyToken(userId: string | null): Promise<string | null> {
  if (userId) {
    const [row] = await db
      .select({ cipher: credentials.valencyTokenCipher })
      .from(credentials)
      .where(eq(credentials.userId, userId))
      .limit(1)
    if (row) {
      try {
        return await decryptSecret(row.cipher)
      } catch {
        // fall through to system token
      }
    }
  }
  return process.env.VALENCY_BEARER_TOKEN ?? null
}

export interface ValencyForUserOpts {
  onStep?: StepRecorder
  fetchImpl?: ValencyClientOptions['fetchImpl']
  maxAttempts?: number
  timeoutMs?: number
}

/** Helper: build a Valency client for a user, throwing if no token is available. */
export async function valencyForUser(
  userId: string | null,
  opts: ValencyForUserOpts = {},
): Promise<ValencyClient> {
  const token = await getValencyToken(userId)
  if (!token) {
    throw new Error(
      'No Valency bearer token available — set one in /app/settings or configure VALENCY_BEARER_TOKEN.',
    )
  }
  return new ValencyClient({
    token,
    rateLimitKey: userId ?? 'anon',
    onStep: opts.onStep,
    fetchImpl: opts.fetchImpl,
    maxAttempts: opts.maxAttempts,
    timeoutMs: opts.timeoutMs,
  })
}
