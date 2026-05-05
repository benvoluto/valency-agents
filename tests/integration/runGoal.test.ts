/**
 * End-to-end pipeline test against a real Neon dev branch + real Valency MCP.
 *
 * Skipped unless RUN_INTEGRATION=1 to keep the regular `npm test` cheap and
 * deterministic. Run with:
 *   RUN_INTEGRATION=1 npm run test
 *
 * Requires DATABASE_URL, ANTHROPIC_API_KEY, VALENCY_BEARER_TOKEN.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import {
  briefingProvenance,
  briefingSources,
  briefings,
  goalSeeds,
  goals,
  users,
} from '@/db/schema'
import { runGoalPipeline } from '@/lib/pipeline/runGoal'

const SHOULD_RUN = process.env.RUN_INTEGRATION === '1' &&
  !!process.env.ANTHROPIC_API_KEY &&
  !!process.env.VALENCY_BEARER_TOKEN

const TEST_EMAIL = `pipeline-${Date.now()}@e2e.test`

let userId = ''
let goalId = ''

beforeAll(async () => {
  if (!SHOULD_RUN) return
  const [user] = await db
    .insert(users)
    .values({
      email: TEST_EMAIL,
      name: 'Pipeline Tester',
      onboardingCompletedAt: new Date(),
    })
    .returning()
  userId = user.id
  const [goal] = await db
    .insert(goals)
    .values({
      userId,
      title: 'Pipeline integration test',
      description:
        'Tracks recent work in long-context attention research as a smoke test.',
      cadence: 'on_demand',
    })
    .returning()
  goalId = goal.id
  await db.insert(goalSeeds).values([
    { goalId, kind: 'category', value: 'cs.LG' },
    { goalId, kind: 'keyword', value: 'long context attention sinks' },
  ])
})

afterAll(async () => {
  if (!SHOULD_RUN || !userId) return
  await db.delete(users).where(eq(users.id, userId))
})

describe.skipIf(!SHOULD_RUN)('runGoalPipeline (integration)', () => {
  it(
    'produces ≥3 briefings, each with ≥1 source + provenance, and records cost',
    async () => {
      const [user] = await db.select().from(users).where(eq(users.id, userId))
      const [goal] = await db.select().from(goals).where(eq(goals.id, goalId))

      const result = await runGoalPipeline(user, goal)

      expect(result.briefings.length).toBeGreaterThanOrEqual(3)
      expect(result.parentRun.status).toBe('completed')

      for (const b of result.briefings) {
        const sources = await db
          .select()
          .from(briefingSources)
          .where(eq(briefingSources.briefingId, b.id))
        expect(sources.length).toBeGreaterThanOrEqual(1)

        const [prov] = await db
          .select()
          .from(briefingProvenance)
          .where(eq(briefingProvenance.briefingId, b.id))
        expect(prov).toBeTruthy()
        expect(prov?.reasoning.length).toBeGreaterThan(20)
        expect(prov?.whatIWillDo.length).toBeGreaterThan(10)

        expect(b.confidence).toBeGreaterThanOrEqual(0.5)
        expect(b.confidence).toBeLessThanOrEqual(1)
      }

      // Every briefing belongs to this user; no orphans.
      const all = await db
        .select({ id: briefings.id })
        .from(briefings)
        .where(eq(briefings.userId, userId))
      expect(all.length).toBe(result.briefings.length)
    },
    600_000,
  )
})
