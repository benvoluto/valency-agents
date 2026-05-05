import { eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  agentRuns,
  authors,
  briefingProvenance,
  briefingSources,
  briefingTags,
  briefings,
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
import { SCOUT_AGENT, type ScoutOutput } from '@/lib/agents/scout'
import {
  BudgetExceededError,
  assertWithinBudget,
  runAgent,
  todaysSpendUsd,
} from '@/lib/agents/runner'
import { HAIKU } from '@/lib/agents/pricing'

const VALENCY_URL = 'https://labs.valency.io/mcp'

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

  try {
    // ─── Scout ────────────────────────────────────────────────────────────
    const scoutModel = await pickModelForNonEditor(user, SCOUT_AGENT.defaultModel)
    const scoutInput = {
      goal: { id: goal.id, title: goal.title, description: goal.description },
      seeds: seeds.map((s) => ({ kind: s.kind, value: s.value, weight: s.weight })),
    }
    const scout = await runAgent({
      agent: SCOUT_AGENT,
      userId: user.id,
      goalId: goal.id,
      parentRunId: parentRun.id,
      model: scoutModel,
      valency,
      userMessage: JSON.stringify(scoutInput),
    })

    // ─── Analyst ──────────────────────────────────────────────────────────
    const analystInput = {
      goal: { id: goal.id, title: goal.title, description: goal.description },
      seeds: seeds.map((s) => ({ kind: s.kind, value: s.value })),
      candidates: scout.output.candidates,
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

    const summary = {
      candidateCount: scout.output.candidates.length,
      shortlistCount: analyst.output.shortlist.length,
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

async function pickModelForNonEditor(
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

async function upsertLibrarianEntities(out: LibrarianOutput): Promise<void> {
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

async function materializeBriefings(
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
          .where(sql`${tags.slug} = ANY(${distinctSlugs})`)
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

