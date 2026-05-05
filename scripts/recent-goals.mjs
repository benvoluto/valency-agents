import { neon } from '@neondatabase/serverless'
const sql = neon(process.env.DATABASE_URL_UNPOOLED)

const goals = await sql`
  select g.id, g.title, g.cadence, g.status, g.created_at, u.email
  from goal g
  join "user" u on u.id = g.user_id
  order by g.created_at desc
  limit 10
`
console.log(`recent goals (${goals.length}):`)
for (const g of goals)
  console.log(
    `  ${g.created_at.toISOString()}  ${g.cadence.padEnd(10)} ${g.email.padEnd(28)} ${g.title}`,
  )

const runs = await sql`
  select id, agent, status, started_at, summary_json
  from agent_run
  order by started_at desc
  limit 10
`
console.log(`\nrecent agent_runs (${runs.length}):`)
for (const r of runs) {
  const inngestId = r.summary_json?.inngestRunId ?? '—'
  console.log(
    `  ${r.started_at.toISOString()}  ${r.agent.padEnd(14)} ${r.status.padEnd(10)}  inngest:${inngestId}`,
  )
}
