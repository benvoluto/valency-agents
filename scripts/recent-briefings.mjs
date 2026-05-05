import { neon } from '@neondatabase/serverless'
const sql = neon(process.env.DATABASE_URL_UNPOOLED)

const runs = await sql`
  select id, agent, status, started_at, finished_at, cost_usd, tokens_in, tokens_out, summary_json
  from agent_run
  order by started_at desc
  limit 10
`
console.log(`recent runs (${runs.length}):`)
for (const r of runs) {
  const inn = r.summary_json?.inngestRunId ?? '—'
  const summary = r.summary_json
    ? `briefings:${r.summary_json.briefingCount ?? '?'} cost:$${(r.cost_usd ?? 0).toFixed(4)}`
    : ''
  console.log(
    `  ${r.started_at.toISOString()}  ${r.agent.padEnd(14)} ${r.status.padEnd(10)}  ${summary}  inngest:${inn.slice(0, 12)}`,
  )
}

const briefings = await sql`
  select b.id, b.kind, b.priority, b.confidence, b.title, b.created_at
  from briefing b
  join "user" u on u.id = b.user_id
  where u.email = 'ben.clemens@gmail.com'
  order by b.created_at desc
  limit 20
`
console.log(`\nbriefings for ben.clemens@gmail.com (${briefings.length}):`)
for (const b of briefings)
  console.log(
    `  ${b.created_at.toISOString()}  ${b.priority.padEnd(11)} ${b.kind.padEnd(16)} conf ${b.confidence.toFixed(2)}  ${b.title.slice(0, 80)}`,
  )
