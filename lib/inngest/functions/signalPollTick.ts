import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { goals, users } from '@/db/schema'
import { isGoalDue } from '@/lib/cadence'
import { inngest } from '../client'

interface DueGoal {
  userId: string
  goalId: string
}

export const signalPollTick = inngest.createFunction(
  {
    id: 'signal-poll-tick',
    name: 'Cadence poll tick',
    triggers: [{ cron: '*/15 * * * *' }],
    retries: 0,
  },
  async ({ step }) => {
    const now = new Date()

    // We do candidate listing + due-filter inside one step so Date fields
    // never have to round-trip through Inngest's JSON serializer.
    const due: DueGoal[] = await step.run('list and filter goals', async () => {
      const candidates = await db
        .select({
          id: goals.id,
          userId: goals.userId,
          cadence: goals.cadence,
          lastBriefedAt: goals.lastBriefedAt,
          status: goals.status,
        })
        .from(goals)
        .where(eq(goals.status, 'active'))
      const out: DueGoal[] = []
      for (const goal of candidates) {
        const [user] = await db
          .select({ id: users.id, timezone: users.timezone })
          .from(users)
          .where(eq(users.id, goal.userId))
        if (!user) continue
        if (isGoalDue(goal, user, now)) {
          out.push({ userId: goal.userId, goalId: goal.id })
        }
      }
      return out
    })

    if (due.length === 0) return { fired: 0 }

    await step.sendEvent(
      'fan-out due goals',
      due.map((d: DueGoal) => ({
        name: 'goal.run.requested',
        data: { userId: d.userId, goalId: d.goalId, reason: 'cron' },
      })),
    )

    return { fired: due.length }
  },
)
