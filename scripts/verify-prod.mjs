import { neon } from '@neondatabase/serverless'
const sql = neon(process.env.DATABASE_URL_UNPOOLED)
const rows = await sql`select hash, created_at from drizzle.__drizzle_migrations order by created_at`
console.log(`applied migrations: ${rows.length}`)
for (const r of rows)
  console.log(`  ${r.hash.slice(0, 12)}  ${new Date(Number(r.created_at)).toISOString()}`)
const tables = await sql`select tablename from pg_tables where schemaname = 'public' order by tablename`
console.log(`\npublic tables: ${tables.length}`)
console.log(tables.map((t) => `  ${t.tablename}`).join('\n'))
