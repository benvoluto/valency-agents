/**
 * Chaos test (Phase 13): kill the Anthropic call mid-pipeline and assert the
 * orchestrator marks the run failed cleanly + writes a usable error trace.
 *
 * Gated on RUN_INTEGRATION=1 so it doesn't run on every PR (the test seeds
 * a real user/goal in Neon dev). Live Anthropic is mocked at the module
 * level via vi.mock — no $$$ spent.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'

const SHOULD_RUN = process.env.RUN_INTEGRATION === '1'

vi.mock('@anthropic-ai/sdk', () => {
  class FakeAnthropic {
    beta = {
      messages: {
        create: vi.fn().mockImplementation(async () => {
          throw new Error('chaos: Anthropic call failed')
        }),
        stream: vi.fn(),
      },
    }
    messages = this.beta.messages
  }
  return { default: FakeAnthropic }
})

const { db } = await import('@/db')
const {
  agentRuns,
  briefings,
  goals,
  goalSeeds,
  users,
} = await import('@/db/schema')
const { runGoalPipeline } = await import('@/lib/pipeline/runGoal')

const TEST_EMAIL = `chaos-${Date.now()}@e2e.test`
let userId = ''
let goalId = ''

beforeAll(async () => {
  if (!SHOULD_RUN) return
  const [u] = await db
    .insert(users)
    .values({
      email: TEST_EMAIL,
      name: 'Chaos Tester',
      onboardingCompletedAt: new Date(),
    })
    .returning()
  userId = u.id
  const [g] = await db
    .insert(goals)
    .values({
      userId,
      title: 'Chaos goal',
      description: 'Forces Anthropic to fail to verify error reporting.',
      cadence: 'on_demand',
    })
    .returning()
  goalId = g.id
  await db
    .insert(goalSeeds)
    .values([{ goalId, kind: 'category', value: 'cs.LG' }])
})

afterAll(async () => {
  if (!SHOULD_RUN || !userId) return
  await db.delete(users).where(eq(users.id, userId))
})

describe.skipIf(!SHOULD_RUN)('chaos: Anthropic mid-pipeline failure', () => {
  it('marks parent run failed, records the error, writes no briefings', async () => {
    const [u] = await db.select().from(users).where(eq(users.id, userId))
    const [g] = await db.select().from(goals).where(eq(goals.id, goalId))

    await expect(runGoalPipeline(u, g)).rejects.toThrow(/chaos|Anthropic/)

    const runs = await db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.userId, userId))
    expect(runs.length).toBeGreaterThanOrEqual(1)
    const parent = runs.find((r) => r.agent === 'orchestrator')
    expect(parent?.status).toBe('failed')
    expect(parent?.errorJson).toBeTruthy()

    const written = await db
      .select()
      .from(briefings)
      .where(eq(briefings.userId, userId))
    expect(written).toEqual([])
  })
})
