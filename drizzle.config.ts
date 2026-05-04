import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

config({ path: '.vercel/.env.development.local' })
config({ path: '.env.local', override: false })
config({ path: '.env', override: false })

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
if (!url) {
  throw new Error(
    'DATABASE_URL_UNPOOLED or DATABASE_URL must be set (try `vercel env pull`).',
  )
}

export default defineConfig({
  schema: './db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
})
