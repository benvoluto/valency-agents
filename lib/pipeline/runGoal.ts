import { and, eq, gte, inArray, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  agentRuns,
  authors,
  briefingProvenance,
  briefingSources,
  briefingTags,
  briefings,
  follows,
  goalSeeds,
  papers,
  tags,
  type AgentRun,
  type Briefing,
  type Goal,
  type User,
} from '@/db/schema'
import { getValencyToken } from '@/lib/valency'
import { ANALYST_AGENT, type AnalystOutput } from '@/lib/agents/analyst'
import { EDITOR_AGENT, type EditorOutput } from '@/lib/agents/editor'
import { LIBRARIAN_AGENT, type LibrarianOutput } from '@/lib/agents/librarian'
import { type ScoutOutput } from '@/lib/agents/scout'
import { deterministicScout } from './deterministicScout'
import {
  BudgetExceededError,
  assertWithinBudget,
  runAgent,
  todaysSpendUsd,
} from '@/lib/agents/runner'
import { HAIKU } from '@/lib/agents/pricing'
import { sendEvent } from '@/lib/inngest/client'

export const VALENCY_URL = 'https://labs.valency.io/mcp'

export interface RunGoalResult {
  parentRun: AgentRun
  briefings: Briefing[]
  scout: ScoutOutput
  analyst: AnalystOutput
  librarian: LibrarianOutput
  editor: EditorOutput
}

export async function runGoalPipeline(
  user: User,
  goal: Goal,
): Promise<RunGoalResult> {
  // Hard budget kill — Phase 8 in the plan.
  await assertWithinBudget(user.id, user.dailyBudgetUsd, 2)

  const valencyToken = await getValencyToken(user.id)
  if (!valencyToken) {
    throw new Error(
      `User ${user.id} has no Valency token (set in /app/settings) and no system fallback.`,
    )
  }
  const valency = { url: VALENCY_URL, token: valencyToken }

  const seeds = await db.select().from(goalSeeds).where(eq(goalSeeds.goalId, goal.id))
  if (seeds.length === 0) {
    throw new Error(`Goal ${goal.id} has no seeds; nothing to run.`)
  }

  const [parentRun] = await db
    .insert(agentRuns)
    .values({
      userId: user.id,
      goalId: goal.id,
      agent: 'orchestrator',
      status: 'running',
    })
    .returning()

  const ctx = await assessUserContext(user.id, goal.id)

  try {
    // ─── Scout (deterministic) ────────────────────────────────────────────
    // We used to invoke an LLM-driven Scout against Anthropic+MCP, but for
    // goals with 10+ seeds the Anthropic loop reliably exceeded 800s and the
    // function died with zero recorded steps. Scout's job is enumeration —
    // pick the right Valency tool per seed and gather candidates — which is
    // mechanical. The deterministic per-seed call is fast (~3s for 50
    // candidates), free, and what the goal-detail "Preview" button already
    // uses. ctx.firstRun is acknowledged here for parity with the prompt
    // signal but the deterministic path doesn't currently widen — the
    // per-seed Valency calls return the corpus's freshest matches anyway.
    void ctx.firstRun
    const scout = await deterministicScout(user, goal)

    // ─── Analyst ──────────────────────────────────────────────────────────
    const analystInput = {
      goal: { id: goal.id, title: goal.title, description: goal.description },
      seeds: seeds.map((s) => ({ kind: s.kind, value: s.value })),
      candidates: scout.output.candidates,
      firstRun: ctx.firstRun,
    }
    const analyst = await runAgent({
      agent: ANALYST_AGENT,
      userId: user.id,
      goalId: goal.id,
      parentRunId: parentRun.id,
      model: ANALYST_AGENT.defaultModel,
      valency,
      userMessage: JSON.stringify(analystInput),
    })

    // ─── Dedupe ───────────────────────────────────────────────────────────
    // Drop any candidate paper_ids that the user has already seen as a
    // briefing source within the last 30 days, per plan §8.
    const shortlistIds = analyst.output.shortlist.map((s) => s.paper_id)
    const dedupedShortlist = shortlistIds.length > 0
      ? await dropRecentlyShown(user.id, analyst.output.shortlist)
      : []
    // Mutate the analyst output in place so downstream agents see the
    // filtered list. We keep a copy of the dropped IDs in the run summary.
    const droppedIds = analyst.output.shortlist
      .map((s) => s.paper_id)
      .filter((id) => !dedupedShortlist.some((s) => s.paper_id === id))
    analyst.output.shortlist = dedupedShortlist

    // ─── Librarian ────────────────────────────────────────────────────────
    const librarianModel = await pickModelForNonEditor(
      user,
      LIBRARIAN_AGENT.defaultModel,
    )
    const librarianInput = {
      shortlist: analyst.output.shortlist,
      goal: { id: goal.id, title: goal.title },
    }
    const librarian = await runAgent({
      agent: LIBRARIAN_AGENT,
      userId: user.id,
      goalId: goal.id,
      parentRunId: parentRun.id,
      model: librarianModel,
      valency,
      userMessage: JSON.stringify(librarianInput),
    })

    // Upsert papers/authors/tags from Librarian's output.
    await upsertLibrarianEntities(librarian.output)

    // ─── Editor ───────────────────────────────────────────────────────────
    // Editor never gets downgraded. No MCP.
    const editorInput = {
      goal: { id: goal.id, title: goal.title, description: goal.description },
      shortlist: analyst.output.shortlist,
      librarian: librarian.output,
    }
    const editor = await runAgent({
      agent: EDITOR_AGENT,
      userId: user.id,
      goalId: goal.id,
      parentRunId: parentRun.id,
      model: EDITOR_AGENT.defaultModel,
      valency: null,
      userMessage: JSON.stringify(editorInput),
    })

    // ─── Materialize briefings ────────────────────────────────────────────
    const written = await materializeBriefings(
      user.id,
      goal.id,
      parentRun.id,
      editor.output,
    )

    // Fan out one briefing.created event per row — Phase 8 listens with a
    // per-user debounce for digest sends.
    if (written.length > 0) {
      await Promise.all(
        written.map((b) =>
          sendEvent({
            name: 'briefing.created',
            data: { userId: user.id, briefingId: b.id, goalId: b.goalId },
          }).catch(() => {
            // Best-effort: if Inngest isn't configured, just skip.
          }),
        ),
      )
    }

    const summary = {
      candidateCount: scout.output.candidates.length,
      shortlistCount: analyst.output.shortlist.length,
      droppedDuplicateIds: droppedIds,
      taggedPapers: librarian.output.papers.length,
      briefingCount: written.length,
      totalCost: await todaysSpendUsd(user.id),
    }

    const [updated] = await db
      .update(agentRuns)
      .set({
        status: 'completed',
        finishedAt: new Date(),
        summaryJson: summary as unknown as Record<string, unknown>,
      })
      .where(eq(agentRuns.id, parentRun.id))
      .returning()

    return {
      parentRun: updated,
      briefings: written,
      scout: scout.output,
      analyst: analyst.output,
      librarian: librarian.output,
      editor: editor.output,
    }
  } catch (err) {
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
      .where(eq(agentRuns.id, parentRun.id))
    throw err
  }
}

/**
 * Detects whether this user (or this specific goal) has enough prior content
 * for the default 30–60d Scout window to surface anything useful. Returns a
 * `firstRun` flag the orchestrator passes to Scout so it can widen the search.
 *
 * Heuristic: count visible (non-dismissed/non-expired) briefings for the
 * user, plus follows. If both are zero — for the user *and* this goal has
 * no prior briefings either — treat as first run.
 */
export async function assessUserContext(
  userId: string,
  goalId: string,
): Promise<{
  firstRun: boolean
  totalBriefings: number
  totalFollows: number
  goalBriefings: number
}> {
  const [briefingRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(briefings)
    .where(eq(briefings.userId, userId))
  const [followRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(follows)
    .where(eq(follows.userId, userId))
  const [goalBriefingRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(briefings)
    .where(and(eq(briefings.userId, userId), eq(briefings.goalId, goalId)))
  const totalBriefings = Number(briefingRow?.n ?? 0)
  const totalFollows = Number(followRow?.n ?? 0)
  const goalBriefings = Number(goalBriefingRow?.n ?? 0)
  const firstRun =
    goalBriefings === 0 && totalBriefings < 5 && totalFollows < 3
  return { firstRun, totalBriefings, totalFollows, goalBriefings }
}

export async function pickModelForNonEditor(
  user: User,
  defaultModel: string,
): Promise<string> {
  try {
    await assertWithinBudget(user.id, user.dailyBudgetUsd, 1)
    return defaultModel
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      // Downgrade rather than abort. Editor stays on Opus.
      return HAIKU
    }
    throw err
  }
}

export async function upsertLibrarianEntities(out: LibrarianOutput): Promise<void> {
  await db.transaction(async (tx) => {
    if (out.papers.length > 0) {
      await tx
        .insert(papers)
        .values(
          out.papers.map((p) => ({
            id: p.paper_id,
            title: p.title,
            authorsJson: p.authors,
            categoriesJson: p.categories,
            publishedAt: p.published_at ?? null,
            abstract: p.abstract ?? null,
            doi: p.doi ?? null,
          })),
        )
        .onConflictDoUpdate({
          target: papers.id,
          set: {
            title: sqlExcluded('title'),
            authorsJson: sqlExcluded('authors_json'),
            categoriesJson: sqlExcluded('categories_json'),
            publishedAt: sqlExcluded('published_at'),
            abstract: sqlExcluded('abstract'),
            doi: sqlExcluded('doi'),
            lastFetchedAt: new Date(),
          },
        })
    }
    for (const a of out.authors) {
      if (!a.orcid) continue
      await tx
        .insert(authors)
        .values({
          orcid: a.orcid,
          displayName: a.display_name,
          affiliation: a.affiliation ?? null,
          openalexAuthorId: a.openalex_author_id ?? null,
        })
        .onConflictDoUpdate({
          target: authors.orcid,
          set: {
            displayName: a.display_name,
            affiliation: a.affiliation ?? null,
            openalexAuthorId: a.openalex_author_id ?? null,
            lastResolvedAt: new Date(),
          },
        })
    }
    for (const t of out.tags) {
      await tx
        .insert(tags)
        .values({ slug: t.slug, label: t.label })
        .onConflictDoNothing({ target: tags.slug })
    }
  })
}

function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`)
}

const DEDUPE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Removes shortlist items whose paper_id appeared as a `briefing_sources.refId`
 * for this user in the last 30 days (per plan §8 dedupe contract).
 */
export async function dropRecentlyShown<T extends { paper_id: string }>(
  userId: string,
  shortlist: T[],
): Promise<T[]> {
  const ids = shortlist.map((s) => s.paper_id)
  if (ids.length === 0) return shortlist
  const cutoff = new Date(Date.now() - DEDUPE_WINDOW_MS)
  const seen = await db
    .selectDistinct({ refId: briefingSources.refId })
    .from(briefingSources)
    .innerJoin(briefings, eq(briefings.id, briefingSources.briefingId))
    .where(
      and(
        eq(briefings.userId, userId),
        eq(briefingSources.kind, 'paper'),
        inArray(briefingSources.refId, ids),
        gte(briefings.createdAt, cutoff),
      ),
    )
  if (seen.length === 0) return shortlist
  const seenSet = new Set(seen.map((r) => r.refId))
  return shortlist.filter((s) => !seenSet.has(s.paper_id))
}

export async function materializeBriefings(
  userId: string,
  goalId: string,
  runId: string,
  out: EditorOutput,
): Promise<Briefing[]> {
  // Look up tag IDs once for slug→id mapping, including tags newly inserted
  // by the librarian step that share the same DB transaction parent.
  const distinctSlugs = Array.from(
    new Set(
      out.briefings.flatMap((b) => b.tag_slugs).filter((s): s is string => !!s),
    ),
  )
  const tagRows =
    distinctSlugs.length === 0
      ? []
      : await db
          .select({ id: tags.id, slug: tags.slug })
          .from(tags)
          .where(inArray(tags.slug, distinctSlugs))
  const tagIdBySlug = new Map(tagRows.map((r) => [r.slug, r.id]))

  return db.transaction(async (tx) => {
    const written: Briefing[] = []
    for (const b of out.briefings) {
      if (b.confidence < 0.5) continue
      const [row] = await tx
        .insert(briefings)
        .values({
          userId,
          goalId,
          runId,
          kind: b.kind,
          priority: b.priority,
          title: b.title,
          summary: b.summary,
          confidence: b.confidence,
        })
        .returning()
      written.push(row)

      if (b.sources.length > 0) {
        await tx.insert(briefingSources).values(
          b.sources.map((s, i) => ({
            briefingId: row.id,
            kind: s.kind,
            refId: s.ref_id,
            snippet: s.snippet ?? null,
            position: i,
            weight: s.weight ?? 1,
          })),
        )
      }

      await tx.insert(briefingProvenance).values({
        briefingId: row.id,
        reasoning: b.reasoning,
        whatIWillDo: b.what_i_will_do,
        scopeJson: b.scope as Record<string, unknown>,
        alternativesConsideredJson: b.alternatives_considered,
      })

      const tagLinks = b.tag_slugs
        .map((slug) => tagIdBySlug.get(slug))
        .filter((id): id is string => !!id)
        .map((tagId) => ({
          briefingId: row.id,
          tagId,
          score: 1,
        }))
      if (tagLinks.length > 0) {
        await tx
          .insert(briefingTags)
          .values(tagLinks)
          .onConflictDoNothing()
      }
    }
    return written
  })
}

