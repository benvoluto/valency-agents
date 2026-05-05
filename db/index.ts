import { neon, Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http'
import { drizzle as drizzlePool } from 'drizzle-orm/neon-serverless'
import ws from 'ws'
import * as schema from './schema'

const url = process.env.DATABASE_URL
if (!url) {
  throw new Error('DATABASE_URL is not set')
}

// In Node, the @neondatabase/serverless Pool driver needs a `ws` polyfill.
// In edge runtimes the global WebSocket is used automatically.
if (typeof WebSocket === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(neonConfig as any).webSocketConstructor = ws
}

const pool = new Pool({ connectionString: url })

/** Pooled DB client with transaction support, used by app code. */
export const db = drizzlePool(pool, { schema })

/** HTTP client for cheap one-shot queries (e.g. /api/health). */
export const sql = neon(url)
export const dbHttp = drizzleHttp(sql, { schema })

export { schema }
