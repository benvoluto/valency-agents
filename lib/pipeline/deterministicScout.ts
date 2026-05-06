import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { goals, type Goal, type User } from '@/db/schema'
import { runGoalPreview } from './preview'
import type { ScoutOutput } from '@/lib/agents/scout'

/**
 * The LLM-driven Scout reliably hangs the function past its 800s budget on
 * goals with many seeds (12+). Each Anthropic+MCP round-trip is ~30s and
 * Scout's job is enumeration, not creativity — so we replaced it with a
 * deterministic per-seed Valency call layer (the same one the goal-detail
 * "Preview" button uses) and shape the output into the schema the Analyst
 * expects.
 *
 * If you want LLM-creative tool selection back later, gate on seed count or
 * goal complexity and only invoke the LLM Scout for small goals.
 */
const SEED_TOOL: Record<string, string> = {
  category: 'search_by_category',
  keyword: 'semantic_search_papers',
  author_orcid: 'find_papers_by_researcher',
  author_name: 'search_by_author',
  paper_id: 'find_similar_papers',
  venue: 'search_by_venue',
}

export async function deterministicScout(
  user: User,
  goal: Goal,
): Promise<{ output: ScoutOutput; parentRunId: string | null }> {
  const result = await runGoalPreview(user.id, goal)
  // Build a map of paperId → seedKey so we can attribute each candidate.
  // runGoalPreview returns deduped candidates in seed-iteration order, so we
  // walk seeds in order and assign each new id to the first seed that
  // produced it.
  const seedAssignment = new Map<string, string>()
  let consumed = 0
  for (const [seedKey, count] of Object.entries(result.summary.papersBySeed)) {
    for (let i = 0; i < count && consumed < result.candidates.length; i++) {
      const p = result.candidates[consumed]
      if (!seedAssignment.has(p.id)) seedAssignment.set(p.id, seedKey)
      consumed++
    }
  }

  const output: ScoutOutput = {
    candidates: result.candidates.map((p) => {
      const seedKey = seedAssignment.get(p.id) ?? 'unknown'
      const [seedKind] = seedKey.split(':')
      const tool = SEED_TOOL[seedKind] ?? 'semantic_search_papers'
      return {
        paper_id: p.id,
        title: p.title,
        why: `Matched ${seedKey} via ${tool}`,
        source_seed: seedKey,
        source_tools: [tool],
      }
    }),
    warnings: result.summary.warnings,
  }
  return { output, parentRunId: result.run.id }
}

export async function loadGoalById(goalId: string): Promise<Goal | null> {
  const [g] = await db.select().from(goals).where(eq(goals.id, goalId)).limit(1)
  return g ?? null
}
