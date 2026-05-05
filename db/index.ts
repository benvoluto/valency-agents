import { neon, Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http'
import { drizzle as drizzlePool } from 'drizzle-orm/neon-serverless'
import ws from 'ws'
import * as schema from './schema'

// We initialize eagerly so the Auth.js Drizzle adapter (which inspects the
// db shape at module load) sees a real Drizzle instance. When DATABASE_URL
// is unset (e.g. `next build` page-data collection in CI), we fall back to a
// non-functional placeholder URL — any actual query will throw at runtime
// with a clear error, but the module graph loads cleanly.

const PLACEHOLDER = 'postgres://build:build@build.invalid:5432/build'
const url = process.env.DATABASE_URL ?? PLACEHOLDER

if (typeof WebSocket === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(neonConfig as any).webSocketConstructor = ws
}

const pool = new Pool({ connectionString: url })

/** Pooled DB client with transaction support. */
export const db = drizzlePool(pool, { schema })

/** HTTP query helper — used by /api/health for cheap one-shot SQL. */
export const sql = neon(url)

/** HTTP-mode Drizzle client. */
export const dbHttp = drizzleHttp(sql, { schema })

/**
 * Throws a clear, actionable error when DATABASE_URL is missing. Call at the
 * top of any function that needs a DB connection — page-data collection at
 * build time hits the import path but not the runtime path, so this only
 * fires when something actually tries to query.
 */
export function assertDbConfigured() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Set it in your env (vercel env or .env.local).',
    )
  }
}

export { schema }
