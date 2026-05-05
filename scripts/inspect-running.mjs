import { neon } from '@neondatabase/serverless'
const sql = neon(process.env.DATABASE_URL_UNPOOLED)

const running = await sql`
  select id, agent, status, started_at, finished_at, cost_usd, tokens_in, tokens_out, error_json
  from agent_run
  where status in ('running', 'failed')
  order by started_at desc
  limit 10
`
console.log(`runs running or failed (${running.length}):`)
for (const r of running) {
  const ageS = Math.floor((Date.now() - r.started_at.getTime()) / 1000)
  console.log(
    `  ${r.started_at.toISOString()}  age:${ageS}s  ${r.agent.padEnd(14)} ${r.status.padEnd(10)}  cost:$${r.cost_usd.toFixed(4)}  tokIn:${r.tokens_in} tokOut:${r.tokens_out}  err:${JSON.stringify(r.error_json ?? null).slice(0, 80)}`,
  )
}

if (running.length > 0) {
  for (const r of running.slice(0, 2)) {
    const steps = await sql`
      select ord, kind, tool_name, latency_ms, error_message, ts
      from agent_step
      where run_id = ${r.id}
      order by ord asc
      limit 30
    `
    console.log(`\nsteps for ${r.agent} ${r.id.slice(0, 8)}:`)
    for (const s of steps)
      console.log(
        `  ${String(s.ord).padStart(2)}  ${s.kind.padEnd(10)} ${(s.tool_name ?? '—').padEnd(28)} ${(s.latency_ms ?? 0)}ms  ${s.error_message ?? ''}`,
      )
  }
}
