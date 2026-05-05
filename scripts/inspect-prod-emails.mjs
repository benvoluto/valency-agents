import { neon } from '@neondatabase/serverless'
const sql = neon(process.env.DATABASE_URL_UNPOOLED)

// Histogram of email domains.
const byDomain = await sql`
  select coalesce(split_part(email, '@', 2), '(null)') as domain,
         count(*)::int as n
  from "user"
  group by 1
  order by n desc
`
console.log('domains:')
for (const r of byDomain) console.log(`  ${String(r.n).padStart(4)}  ${r.domain}`)

// Sample of "real-looking" addresses (not @e2e.test, not @test, not debug).
const realish = await sql`
  select email, name, "onboarding_completed_at" as onboarded
  from "user"
  where email is not null
    and email not like '%@e2e.test'
    and email not like '%@test'
    and email not like 'debug%'
    and email not like 'dbg%'
  order by created_at desc
  limit 20
`
console.log(`\nnon-test users (${realish.length}):`)
for (const r of realish) console.log(`  ${r.email}  ${r.name ?? ''}`)
