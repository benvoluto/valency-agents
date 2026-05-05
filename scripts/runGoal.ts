/**
 * Admin-only CLI: run the agent pipeline for a given user + goal and print
 * the resulting briefings to stdout. Phase 4 — no Inngest yet.
 *
 * Usage:
 *   tsx scripts/runGoal.ts --user <userId|email> --goal <goalId>
 *
 * Requires the same env vars as the running server (DATABASE_URL,
 * ANTHROPIC_API_KEY, VALENCY_BEARER_TOKEN, BRIEFING_ENC_KEY, …). Loads them
 * from .vercel/.env.development.local automatically.
 */
import { config } from 'dotenv'
import { eq, or } from 'drizzle-orm'
import { db } from '../db'
import { goals, users } from '../db/schema'
import { runGoalPipeline } from '../lib/pipeline/runGoal'

config({ path: '.vercel/.env.development.local' })
config({ path: '.env.local', override: false })

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return undefined
  return process.argv[i + 1]
}

async function main() {
  const userArg = arg('user')
  const goalId = arg('goal')
  if (!userArg || !goalId) {
    console.error(
      'Usage: tsx scripts/runGoal.ts --user <userId|email> --goal <goalId>',
    )
    process.exit(2)
  }

  const [user] = await db
    .select()
    .from(users)
    .where(or(eq(users.id, userArg), eq(users.email, userArg)))
    .limit(1)
  if (!user) {
    console.error(`User not found: ${userArg}`)
    process.exit(1)
  }

  const [goal] = await db
    .select()
    .from(goals)
    .where(eq(goals.id, goalId))
    .limit(1)
  if (!goal || goal.userId !== user.id) {
    console.error(`Goal ${goalId} not found for user ${user.id}`)
    process.exit(1)
  }

  console.log(`Running pipeline for user=${user.email} goal="${goal.title}"`)
  const start = Date.now()
  const result = await runGoalPipeline(user, goal)
  const elapsed = ((Date.now() - start) / 1000).toFixed(2)

  console.log(`\n✓ pipeline completed in ${elapsed}s`)
  console.log(`  parent run id: ${result.parentRun.id}`)
  console.log(`  scout candidates: ${result.scout.candidates.length}`)
  console.log(`  analyst shortlist: ${result.analyst.shortlist.length}`)
  console.log(`  librarian papers: ${result.librarian.papers.length}`)
  console.log(`  briefings written: ${result.briefings.length}`)

  for (const b of result.briefings) {
    console.log(`\n  ── ${b.priority.toUpperCase()} · ${b.kind} · conf ${b.confidence.toFixed(2)} ──`)
    console.log(`     ${b.title}`)
    console.log(`     ${b.summary.slice(0, 200)}${b.summary.length > 200 ? '…' : ''}`)
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('pipeline failed:', err)
  process.exit(1)
})
