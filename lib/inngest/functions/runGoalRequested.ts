import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { agentRuns, goals, users } from '@/db/schema'
import { runGoalPipeline } from '@/lib/pipeline/runGoal'
import { inngest } from '../client'

export const runGoalRequested = inngest.createFunction(
  {
    id: 'run-goal-requested',
    name: 'Run goal pipeline',
    triggers: [{ event: 'goal.run.requested' }],
    retries: 1,
    concurrency: { limit: 4 },
    rateLimit: { limit: 30, period: '1h' },
  },
  async ({ event, step, runId }) => {
    const data = event.data as {
      userId: string
      goalId: string
      reason: string
    }
    const { userId, goalId, reason } = data

    // step.run round-trips JSON, so we re-fetch fully-typed rows after the
    // step rather than try to thread Date columns through serialization.
    await step.run('load goal', async () => {
      const [u] = await db.select().from(users).where(eq(users.id, userId))
      const [g] = await db.select().from(goals).where(eq(goals.id, goalId))
      if (!u || !g || g.userId !== u.id) {
        throw new Error(`goal ${goalId} not found for user ${userId}`)
      }
      return { ok: true }
    })

    const [user] = await db.select().from(users).where(eq(users.id, userId))
    const [goal] = await db.select().from(goals).where(eq(goals.id, goalId))

    const result = await step.run('run pipeline', async () => {
      const r = await runGoalPipeline(user, goal)
      return {
        parentRunId: r.parentRun.id,
        briefingsWritten: r.briefings.length,
      }
    })

    await step.run('annotate run id', async () => {
      const [parent] = await db
        .select({ summaryJson: agentRuns.summaryJson })
        .from(agentRuns)
        .where(eq(agentRuns.id, result.parentRunId))
      const summary = {
        ...((parent?.summaryJson as Record<string, unknown> | null) ?? {}),
        inngestRunId: runId,
        reason,
      }
      await db
        .update(agentRuns)
        .set({ summaryJson: summary as Record<string, unknown> })
        .where(eq(agentRuns.id, result.parentRunId))
    })

    await step.run('mark briefed', async () => {
      await db
        .update(goals)
        .set({ lastBriefedAt: new Date() })
        .where(eq(goals.id, goalId))
    })

    return {
      goalId,
      briefingsWritten: result.briefingsWritten,
      parentRunId: result.parentRunId,
    }
  },
)
