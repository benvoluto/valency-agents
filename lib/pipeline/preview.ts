import { eq } from 'drizzle-orm'
import { db } from '@/db'
import {
  agentRuns,
  agentSteps,
  goalSeeds,
  type AgentRun,
  type Goal,
} from '@/db/schema'
import { valencyForUser, tools as valency, type PaperRow } from '@/lib/valency'
import type { ToolCallStep } from '@/lib/valency/client'

const MAX_CANDIDATES = 50
const PER_SEED_LIMIT = 25

export interface PreviewSummary {
  candidateCount: number
  papersBySeed: Record<string, number>
  warnings: string[]
}

export interface PreviewResult {
  run: AgentRun
  candidates: PaperRow[]
  summary: PreviewSummary
}

/**
 * Runs Scout-shaped Valency calls for every seed of `goal` and aggregates the
 * results. Persists an agentRun + one agentStep per Valency call so the run
 * inspector can show the full trace. Deterministic — no LLM in this path.
 */
export async function runGoalPreview(
  userId: string,
  goal: Goal,
): Promise<PreviewResult> {
  const seeds = await db
    .select()
    .from(goalSeeds)
    .where(eq(goalSeeds.goalId, goal.id))

  const [run] = await db
    .insert(agentRuns)
    .values({
      userId,
      goalId: goal.id,
      agent: 'preview',
      status: 'running',
    })
    .returning()

  let ord = 0
  const seenIds = new Set<string>()
  const candidates: PaperRow[] = []
  const warnings: string[] = []
  const papersBySeed: Record<string, number> = {}

  const recordStep = async (event: ToolCallStep) => {
    ord += 1
    await db.insert(agentSteps).values({
      runId: run.id,
      ord,
      kind: 'tool_call',
      toolName: event.toolName,
      requestJson: event.request as Record<string, unknown>,
      responseJson:
        event.response === null ? null : (event.response as Record<string, unknown>),
      latencyMs: event.latencyMs,
      errorMessage: event.error ?? null,
    })
  }

  let client
  try {
    client = await valencyForUser(userId, { onStep: recordStep })
  } catch (err) {
    await markFailed(run.id, errorPayload(err))
    throw err
  }

  try {
    for (const seed of seeds) {
      if (candidates.length >= MAX_CANDIDATES) break
      const seedKey = `${seed.kind}:${seed.value}`
      try {
        const papers = await runForSeed(client, seed.kind, seed.value, {
          limit: Math.min(PER_SEED_LIMIT, MAX_CANDIDATES - candidates.length),
        })
        let added = 0
        for (const p of papers) {
          if (seenIds.has(p.id)) continue
          seenIds.add(p.id)
          candidates.push(p)
          added += 1
          if (candidates.length >= MAX_CANDIDATES) break
        }
        papersBySeed[seedKey] = added
      } catch (err) {
        warnings.push(
          `Seed ${seedKey} failed: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }

    const summary: PreviewSummary = {
      candidateCount: candidates.length,
      papersBySeed,
      warnings,
    }

    const [updated] = await db
      .update(agentRuns)
      .set({
        status: 'completed',
        finishedAt: new Date(),
        summaryJson: summary as unknown as Record<string, unknown>,
      })
      .where(eq(agentRuns.id, run.id))
      .returning()

    return { run: updated, candidates, summary }
  } catch (err) {
    await markFailed(run.id, errorPayload(err))
    throw err
  }
}

async function markFailed(runId: string, error: Record<string, unknown>) {
  await db
    .update(agentRuns)
    .set({
      status: 'failed',
      finishedAt: new Date(),
      errorJson: error,
    })
    .where(eq(agentRuns.id, runId))
}

function errorPayload(err: unknown): Record<string, unknown> {
  if (err instanceof Error) return { message: err.message, name: err.name }
  return { message: String(err) }
}

async function runForSeed(
  client: Awaited<ReturnType<typeof valencyForUser>>,
  kind: string,
  value: string,
  opts: { limit: number },
): Promise<PaperRow[]> {
  switch (kind) {
    case 'category': {
      const r = await valency.searchByCategory(client, {
        category: value,
        limit: opts.limit,
      })
      return r.papers
    }
    case 'keyword': {
      const r = await valency.semanticSearchPapers(client, {
        query: value,
        limit: opts.limit,
      })
      return r.papers
    }
    case 'author_orcid': {
      const r = await valency.findPapersByResearcher(client, {
        orcid: value,
        limit: opts.limit,
      })
      return r.papers
    }
    case 'author_name': {
      const r = await valency.searchByAuthor(client, {
        author: value,
        limit: opts.limit,
      })
      return r.papers
    }
    case 'paper_id': {
      const r = await valency.findSimilarPapers(client, {
        paper_id: value,
        limit: opts.limit,
      })
      return r.papers
    }
    case 'venue': {
      const r = await valency.searchByVenue(client, {
        venue: value,
        limit: opts.limit,
      })
      return r.papers
    }
    default:
      return []
  }
}

