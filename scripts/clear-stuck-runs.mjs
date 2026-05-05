import { neon } from '@neondatabase/serverless'
const sql = neon(process.env.DATABASE_URL_UNPOOLED)

// Clear ALL running runs — none of them are live (Vercel timed out before
// maxDuration fix). Idempotent.
const updated = await sql`
  UPDATE agent_run
  SET status = 'failed',
      finished_at = current_timestamp,
      error_json = '{"message":"Vercel function timed out at 300s; cleared by clear-stuck-runs.mjs after maxDuration fix"}'::jsonb
  WHERE status = 'running'
  RETURNING id, agent, started_at
`
console.log(`marked ${updated.length} runs as failed:`)
for (const r of updated)
  console.log(`  ${r.id.slice(0, 8)}  ${r.agent.padEnd(14)} started ${r.started_at}`)
