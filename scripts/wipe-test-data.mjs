import { neon } from '@neondatabase/serverless'
const sql = neon(process.env.DATABASE_URL_UNPOOLED)

const before = {
  user: (await sql`select count(*)::int as n from "user"`)[0].n,
  briefing: (await sql`select count(*)::int as n from briefing`)[0].n,
  thread: (await sql`select count(*)::int as n from thread`)[0].n,
  action: (await sql`select count(*)::int as n from action`)[0].n,
  agentRun: (await sql`select count(*)::int as n from agent_run`)[0].n,
  goal: (await sql`select count(*)::int as n from goal`)[0].n,
  email: (await sql`select count(*)::int as n from email`)[0].n,
}

// Most cleanup happens via ON DELETE CASCADE from the user table.
// We also clear corpus tables (paper, author, tag) because they're shared
// across users — keeping them around just to be safe, since they aren't
// PII and the e2e + agent runs may have populated them.
const deleted = await sql`
  DELETE FROM "user"
  WHERE email LIKE '%@e2e.test'
     OR email LIKE '%@test'
  RETURNING id
`

const after = {
  user: (await sql`select count(*)::int as n from "user"`)[0].n,
  briefing: (await sql`select count(*)::int as n from briefing`)[0].n,
  thread: (await sql`select count(*)::int as n from thread`)[0].n,
  action: (await sql`select count(*)::int as n from action`)[0].n,
  agentRun: (await sql`select count(*)::int as n from agent_run`)[0].n,
  goal: (await sql`select count(*)::int as n from goal`)[0].n,
  email: (await sql`select count(*)::int as n from email`)[0].n,
}

console.log(`deleted ${deleted.length} user rows (cascades handled the rest)\n`)
console.log('table     before   after   removed')
console.log('-'.repeat(40))
for (const k of Object.keys(before)) {
  const b = before[k]
  const a = after[k]
  console.log(
    `${k.padEnd(10)} ${String(b).padStart(5)}  ${String(a).padStart(6)}  ${String(b - a).padStart(8)}`,
  )
}

const remaining = await sql`select email, name from "user" order by created_at`
console.log('\nremaining users:')
for (const r of remaining) console.log(`  ${r.email}  ${r.name ?? ''}`)
