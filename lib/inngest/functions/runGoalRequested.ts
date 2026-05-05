import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { agentRuns, goals, goalSeeds, users } from '@/db/schema'
import { ANALYST_AGENT, type AnalystOutput } from '@/lib/agents/analyst'
import { EDITOR_AGENT, type EditorOutput } from '@/lib/agents/editor'
import { LIBRARIAN_AGENT, type LibrarianOutput } from '@/lib/agents/librarian'
import { SCOUT_AGENT, type ScoutOutput } from '@/lib/agents/scout'
import {
  assertWithinBudget,
  runAgent,
  todaysSpendUsd,
} from '@/lib/agents/runner'
import {
  VALENCY_URL,
  dropRecentlyShown,
  materializeBriefings,
  pickModelForNonEditor,
  upsertLibrarianEntities,
} from '@/lib/pipeline/runGoal'
import { getValencyToken } from '@/lib/valency'
import { inngest } from '../client'

interface SetupResult {
  parentRunId: string
  goalTitle: string
  goalDescription: string
  seeds: Array<{ kind: string; value: string; weight: number }>
}

export const runGoalRequested = inngest.createFunction(
  {
    id: 'run-goal-requested',
    name: 'Run goal pipeline',
    triggers: [{ event: 'goal.run.requested' }],
    retries: 1,
    concurrency: { limit: 4 },
    rateLimit: { limit: 30, period: '1h' },
  },
  async ({ event, step, runId: inngestRunId }) => {
    const data = event.data as {
      userId: string
      goalId: string
      reason: string
    }
    const { userId, goalId, reason } = data

    // Each agent step is its own HTTP invocation against /api/inngest, so
    // each gets its own 800s function timeout. The whole pipeline used to run
    // inside a single step.run and routinely exceeded 800s on the first
    // Anthropic+MCP loop.
    const setup = await step.run('setup', async (): Promise<SetupResult> => {
      const [u] = await db.select().from(users).where(eq(users.id, userId))
      const [g] = await db.select().from(goals).where(eq(goals.id, goalId))
      if (!u || !g || g.userId !== u.id) {
        throw new Error(`goal ${goalId} not found for user ${userId}`)
      }
      await assertWithinBudget(u.id, u.dailyBudgetUsd, 2)
      const token = await getValencyToken(u.id)
      if (!token) {
        throw new Error(
          `User ${u.id} has no Valency token (set in /app/settings) and no system fallback.`,
        )
      }
      const seedRows = await db
        .select()
        .from(goalSeeds)
        .where(eq(goalSeeds.goalId, g.id))
      if (seedRows.length === 0) {
        throw new Error(`Goal ${g.id} has no seeds; nothing to run.`)
      }
      const [parentRun] = await db
        .insert(agentRuns)
        .values({
          userId: u.id,
          goalId: g.id,
          agent: 'orchestrator',
          status: 'running',
          summaryJson: { inngestRunId, reason } as Record<string, unknown>,
        })
        .returning()
      return {
        parentRunId: parentRun.id,
        goalTitle: g.title,
        goalDescription: g.description ?? '',
        seeds: seedRows.map((s) => ({
          kind: s.kind,
          value: s.value,
          weight: s.weight,
        })),
      }
    })

    try {
      const scoutOutput = await step.run(
        'scout',
        async (): Promise<ScoutOutput> => {
          const [user] = await db.select().from(users).where(eq(users.id, userId))
          const token = await getValencyToken(userId)
          if (!token) throw new Error(`Valency token missing for ${userId}`)
          const model = await pickModelForNonEditor(user, SCOUT_AGENT.defaultModel)
          const scoutInput = {
            goal: {
              id: goalId,
              title: setup.goalTitle,
              description: setup.goalDescription,
            },
            seeds: setup.seeds,
          }
          const scout = await runAgent({
            agent: SCOUT_AGENT,
            userId,
            goalId,
            parentRunId: setup.parentRunId,
            model,
            valency: { url: VALENCY_URL, token },
            userMessage: JSON.stringify(scoutInput),
          })
          return scout.output
        },
      )

      const analystResult = await step.run(
        'analyst',
        async (): Promise<{
          shortlist: AnalystOutput['shortlist']
          droppedIds: string[]
        }> => {
          const token = await getValencyToken(userId)
          if (!token) throw new Error(`Valency token missing for ${userId}`)
          const analystInput = {
            goal: {
              id: goalId,
              title: setup.goalTitle,
              description: setup.goalDescription,
            },
            seeds: setup.seeds.map((s) => ({ kind: s.kind, value: s.value })),
            candidates: scoutOutput.candidates,
          }
          const analyst = await runAgent({
            agent: ANALYST_AGENT,
            userId,
            goalId,
            parentRunId: setup.parentRunId,
            model: ANALYST_AGENT.defaultModel,
            valency: { url: VALENCY_URL, token },
            userMessage: JSON.stringify(analystInput),
          })
          const dedupedShortlist =
            analyst.output.shortlist.length > 0
              ? await dropRecentlyShown(userId, analyst.output.shortlist)
              : []
          const droppedIds = analyst.output.shortlist
            .map((s) => s.paper_id)
            .filter((id) => !dedupedShortlist.some((s) => s.paper_id === id))
          return { shortlist: dedupedShortlist, droppedIds }
        },
      )

      const librarianOutput = await step.run(
        'librarian',
        async (): Promise<LibrarianOutput> => {
          const [user] = await db.select().from(users).where(eq(users.id, userId))
          const token = await getValencyToken(userId)
          if (!token) throw new Error(`Valency token missing for ${userId}`)
          const model = await pickModelForNonEditor(
            user,
            LIBRARIAN_AGENT.defaultModel,
          )
          const librarianInput = {
            shortlist: analystResult.shortlist,
            goal: { id: goalId, title: setup.goalTitle },
          }
          const librarian = await runAgent({
            agent: LIBRARIAN_AGENT,
            userId,
            goalId,
            parentRunId: setup.parentRunId,
            model,
            valency: { url: VALENCY_URL, token },
            userMessage: JSON.stringify(librarianInput),
          })
          await upsertLibrarianEntities(librarian.output)
          return librarian.output
        },
      )

      const editorOutput = await step.run(
        'editor',
        async (): Promise<EditorOutput> => {
          const editorInput = {
            goal: {
              id: goalId,
              title: setup.goalTitle,
              description: setup.goalDescription,
            },
            shortlist: analystResult.shortlist,
            librarian: librarianOutput,
          }
          const editor = await runAgent({
            agent: EDITOR_AGENT,
            userId,
            goalId,
            parentRunId: setup.parentRunId,
            model: EDITOR_AGENT.defaultModel,
            valency: null,
            userMessage: JSON.stringify(editorInput),
          })
          return editor.output
        },
      )

      const materialize = await step.run(
        'materialize',
        async (): Promise<{
          briefingIds: Array<{ id: string; goalId: string | null }>
        }> => {
          const written = await materializeBriefings(
            userId,
            goalId,
            setup.parentRunId,
            editorOutput,
          )
          const summary = {
            inngestRunId,
            reason,
            candidateCount: scoutOutput.candidates.length,
            shortlistCount: analystResult.shortlist.length,
            droppedDuplicateIds: analystResult.droppedIds,
            taggedPapers: librarianOutput.papers.length,
            briefingCount: written.length,
            totalCost: await todaysSpendUsd(userId),
          }
          await db
            .update(agentRuns)
            .set({
              status: 'completed',
              finishedAt: new Date(),
              summaryJson: summary as Record<string, unknown>,
            })
            .where(eq(agentRuns.id, setup.parentRunId))
          return {
            briefingIds: written.map((b) => ({ id: b.id, goalId: b.goalId })),
          }
        },
      )

      if (materialize.briefingIds.length > 0) {
        await step.sendEvent(
          'fan-out briefings',
          materialize.briefingIds.map((b) => ({
            name: 'briefing.created' as const,
            data: { userId, briefingId: b.id, goalId: b.goalId },
          })),
        )
      }

      await step.run('mark briefed', async () => {
        await db
          .update(goals)
          .set({ lastBriefedAt: new Date() })
          .where(eq(goals.id, goalId))
      })

      return {
        goalId,
        briefingsWritten: materialize.briefingIds.length,
        parentRunId: setup.parentRunId,
      }
    } catch (err) {
      // Mark the orchestrator parent run as failed once a step exhausts its
      // own retries. Idempotent if Inngest replays the function.
      await db
        .update(agentRuns)
        .set({
          status: 'failed',
          finishedAt: new Date(),
          errorJson: {
            message: err instanceof Error ? err.message : String(err),
            name: err instanceof Error ? err.name : 'unknown',
          },
        })
        .where(eq(agentRuns.id, setup.parentRunId))
      throw err
    }
  },
)
