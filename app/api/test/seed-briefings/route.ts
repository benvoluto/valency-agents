import { eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import {
  agentRuns,
  briefingProvenance,
  briefingSources,
  briefingTags,
  briefings,
  goalSeeds,
  goals,
  tags,
  users,
} from '@/db/schema'

interface SeedRequest {
  email?: string
}

/**
 * E2E-only: seeds a deterministic set of briefings (one per priority) for the
 * given user, complete with sources, provenance, and tags. Lets the Phase 5
 * surface tests render real data without running the live agent pipeline.
 */
export async function POST(req: Request) {
  if (process.env.E2E_TEST_MODE !== 'true') {
    return new Response('disabled', { status: 404 })
  }
  const { email } = (await req.json()) as SeedRequest
  if (!email) {
    return Response.json({ error: 'email required' }, { status: 400 })
  }

  const [user] = await db.select().from(users).where(eq(users.email, email))
  if (!user) {
    return Response.json({ error: 'user not found' }, { status: 404 })
  }

  // Make sure the user has a goal to attach to. Reuse one if it exists.
  let [goal] = await db.select().from(goals).where(eq(goals.userId, user.id)).limit(1)
  if (!goal) {
    ;[goal] = await db
      .insert(goals)
      .values({
        userId: user.id,
        title: 'Long-context attention research',
        description: 'Seeded by /api/test/seed-briefings.',
        cadence: 'weekly',
      })
      .returning()
    await db
      .insert(goalSeeds)
      .values([
        { goalId: goal.id, kind: 'category', value: 'cs.LG' },
        { goalId: goal.id, kind: 'keyword', value: 'attention sinks' },
      ])
  }

  // Tags — upsert by slug.
  const tagDefs = [
    { slug: 'long-context', label: 'Long context' },
    { slug: 'attention-sinks', label: 'Attention sinks' },
    { slug: 'rlhf', label: 'RLHF' },
  ]
  for (const t of tagDefs) {
    await db.insert(tags).values(t).onConflictDoNothing({ target: tags.slug })
  }
  const tagRows = await db
    .select()
    .from(tags)
    .where(inArray(tags.slug, tagDefs.map((t) => t.slug)))
  const tagBySlug = new Map(tagRows.map((t) => [t.slug, t]))

  const [run] = await db
    .insert(agentRuns)
    .values({
      userId: user.id,
      goalId: goal.id,
      agent: 'orchestrator',
      status: 'completed',
      finishedAt: new Date(),
      summaryJson: { source: 'seed-briefings' } as Record<string, unknown>,
    })
    .returning()

  const briefingDefs: Array<{
    kind: typeof briefings.$inferInsert.kind
    priority: typeof briefings.$inferInsert.priority
    title: string
    summary: string
    confidence: number
    reasoning: string
    whatIWillDo: string
    sources: Array<{
      kind: 'paper' | 'author' | 'query' | 'tool_call' | 'web'
      refId: string
      snippet?: string
    }>
    tagSlugs: string[]
  }> = [
    {
      kind: 'counter_evidence',
      priority: 'critical',
      title: 'A v2 challenges the premise of your draft section 3',
      summary:
        'A revision posted yesterday by an author you follow argues the opposite of what your section 3 currently claims. Worth reading before you submit.',
      confidence: 0.91,
      reasoning:
        'Why this surfaced. The author is on your follow list and the v2 abstract directly contradicts the framing of your draft section 3 (semantic match 0.88 to your saved paper P-123).',
      whatIWillDo:
        "I'll save this paper to your library and draft a one-paragraph rebuttal you can paste into section 3. I will not edit your draft directly.",
      sources: [
        {
          kind: 'paper',
          refId: '2602.18196v3',
          snippet: 'Counter-evidence to long-context attention assumption.',
        },
        { kind: 'author', refId: '0000-0002-1825-0097' },
      ],
      tagSlugs: ['long-context', 'attention-sinks'],
    },
    {
      kind: 'new_paper',
      priority: 'process',
      title: 'New paper on attention sinks at long context',
      summary:
        'A v1 from this morning revisits the long-context attention-sink hypothesis with new ablations. Adjacent to your in-flight draft.',
      confidence: 0.84,
      reasoning:
        'Why this surfaced. Semantic match 0.81 to your goal "long-context attention" and the paper cites two of your library papers.',
      whatIWillDo:
        "I'll save this to your library and tag it with long-context. No edits to your draft.",
      sources: [
        { kind: 'paper', refId: '2603.00123v1' },
        { kind: 'query', refId: 'semantic_search:attention sinks long context' },
      ],
      tagSlugs: ['long-context', 'attention-sinks'],
    },
    {
      kind: 'collaborator',
      priority: 'opportunity',
      title: 'Dr. P at MIT has 2 papers adjacent to your goal',
      summary:
        "Two recent papers from a researcher with no co-authors in common with you. Could be a strong collaborator on long-context work.",
      confidence: 0.76,
      reasoning:
        'Why this surfaced. Two recent first-author papers semantically match your goal at >0.75; no co-author overlap with your follows.',
      whatIWillDo:
        "I'll surface their author profile here. I will not email anyone.",
      sources: [
        { kind: 'author', refId: '0000-0001-2345-6789' },
        { kind: 'paper', refId: '2603.00456v1' },
      ],
      tagSlugs: ['long-context'],
    },
    {
      kind: 'trend',
      priority: 'signal',
      title: 'Method M usage in cs.LG is up 38% YoY',
      summary:
        'Year-over-year, papers in cs.LG using method M rose from 4.1% to 5.6% (95% CI ±0.6). Worth knowing if you are considering it for your next project.',
      confidence: 0.72,
      reasoning:
        'Why this surfaced. get_keyword_trends on "method M" in cs.LG shows the YoY rise; sample size is large enough that the trend is robust.',
      whatIWillDo:
        "I'll pin this trend to your library and refresh it monthly.",
      sources: [
        {
          kind: 'tool_call',
          refId: 'get_keyword_trends:method M:cs.LG:year',
          snippet: 'YoY +38%, 95% CI ±0.6',
        },
      ],
      tagSlugs: ['rlhf'],
    },
  ]

  // Wipe any prior seeded briefings for this user so the test is idempotent.
  await db.delete(briefings).where(eq(briefings.userId, user.id))

  const created: string[] = []
  for (const def of briefingDefs) {
    const [b] = await db
      .insert(briefings)
      .values({
        userId: user.id,
        goalId: goal.id,
        runId: run.id,
        kind: def.kind,
        priority: def.priority,
        title: def.title,
        summary: def.summary,
        confidence: def.confidence,
      })
      .returning()
    created.push(b.id)

    await db.insert(briefingSources).values(
      def.sources.map((s, i) => ({
        briefingId: b.id,
        kind: s.kind,
        refId: s.refId,
        snippet: s.snippet ?? null,
        position: i,
        weight: 1,
      })),
    )
    await db.insert(briefingProvenance).values({
      briefingId: b.id,
      reasoning: def.reasoning,
      whatIWillDo: def.whatIWillDo,
      scopeJson: { date_range: '30d', categories: ['cs.LG'] } as Record<string, unknown>,
      alternativesConsideredJson: ['paper X — older preprint, same topic'],
    })
    const tagLinks = def.tagSlugs
      .map((slug) => tagBySlug.get(slug))
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map((t) => ({ briefingId: b.id, tagId: t.id, score: 1 }))
    if (tagLinks.length > 0) {
      await db.insert(briefingTags).values(tagLinks)
    }
  }

  return Response.json({ ok: true, created, runId: run.id })
}
