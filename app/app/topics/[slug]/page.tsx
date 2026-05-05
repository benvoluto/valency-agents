import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from '@phosphor-icons/react/dist/ssr'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { requireOnboardedUser } from '@/lib/auth-helpers'
import { db } from '@/db'
import {
  briefingProvenance,
  briefingSources,
  briefingTags,
  briefings,
  goals,
  tags,
} from '@/db/schema'
import { BriefingCard } from '@/components/surface/BriefingCard'
import type { BriefingWithDetail } from '@/components/surface/types'

interface RouteParams {
  params: Promise<{ slug: string }>
}

export default async function TopicSlugPage({ params }: RouteParams) {
  const user = await requireOnboardedUser()
  const { slug } = await params

  const [tag] = await db
    .select()
    .from(tags)
    .where(eq(tags.slug, slug))
    .limit(1)
  if (!tag) notFound()

  const taggedBriefings = await db
    .select({
      briefing: briefings,
      goalTitle: goals.title,
    })
    .from(briefingTags)
    .innerJoin(briefings, eq(briefings.id, briefingTags.briefingId))
    .leftJoin(goals, eq(goals.id, briefings.goalId))
    .where(
      and(eq(briefingTags.tagId, tag.id), eq(briefings.userId, user.id)),
    )
    .orderBy(desc(briefings.createdAt))
    .limit(50)

  if (taggedBriefings.length === 0) {
    return (
      <>
        <TopicHeader tag={tag} count={0} />
        <section className="bg-surface border-border-subtle rounded-2xl border p-8">
          <p className="text-ink-muted text-sm">
            No briefings under this tag yet (or none belong to you).
          </p>
        </section>
      </>
    )
  }

  const ids = taggedBriefings.map((r) => r.briefing.id)

  const [provs, allSources, tagLinks] = await Promise.all([
    db
      .select()
      .from(briefingProvenance)
      .where(inArray(briefingProvenance.briefingId, ids)),
    db
      .select()
      .from(briefingSources)
      .where(inArray(briefingSources.briefingId, ids)),
    db
      .select({
        briefingId: briefingTags.briefingId,
        tag: tags,
      })
      .from(briefingTags)
      .innerJoin(tags, eq(tags.id, briefingTags.tagId))
      .where(inArray(briefingTags.briefingId, ids)),
  ])

  const provByBriefing = new Map(provs.map((p) => [p.briefingId, p]))
  const sourcesByBriefing = new Map<string, (typeof allSources)>()
  for (const s of allSources) {
    const arr = sourcesByBriefing.get(s.briefingId) ?? []
    arr.push(s)
    sourcesByBriefing.set(s.briefingId, arr)
  }
  const tagsByBriefing = new Map<string, (typeof tagLinks)[number]['tag'][]>()
  for (const t of tagLinks) {
    const arr = tagsByBriefing.get(t.briefingId) ?? []
    arr.push(t.tag)
    tagsByBriefing.set(t.briefingId, arr)
  }

  const feed: BriefingWithDetail[] = taggedBriefings.map((r) => ({
    briefing: r.briefing,
    goalTitle: r.goalTitle,
    provenance: provByBriefing.get(r.briefing.id) ?? null,
    sources: (sourcesByBriefing.get(r.briefing.id) ?? []).sort(
      (a, b) => a.position - b.position,
    ),
    tags: tagsByBriefing.get(r.briefing.id) ?? [],
  }))

  // Aggregate distinct paper + author refs across this tag's sources.
  const paperSet = new Set<string>()
  const authorSet = new Set<string>()
  for (const s of allSources) {
    if (s.kind === 'paper') paperSet.add(s.refId)
    else if (s.kind === 'author') authorSet.add(s.refId)
  }

  return (
    <>
      <TopicHeader tag={tag} count={feed.length} />

      <section className="mb-8">
        <h2 className="text-ink-muted font-mono text-[11px] tracking-wider uppercase">
          Briefings under &ldquo;{tag.label}&rdquo; ({feed.length})
        </h2>
        <ul className="mt-3 space-y-3">
          {feed.map((b) => (
            <li key={b.briefing.id} className="relative">
              <BriefingCard data={b} />
            </li>
          ))}
        </ul>
      </section>

      {paperSet.size + authorSet.size > 0 ? (
        <section className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {paperSet.size > 0 ? (
            <div className="bg-surface border-border-subtle rounded-2xl border p-5">
              <h3 className="text-ink-muted font-mono text-[11px] tracking-wider uppercase">
                Papers ({paperSet.size})
              </h3>
              <ul className="mt-3 space-y-1">
                {[...paperSet].slice(0, 30).map((id) => (
                  <li key={id} className="text-ink font-mono text-xs">
                    {id}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {authorSet.size > 0 ? (
            <div className="bg-surface border-border-subtle rounded-2xl border p-5">
              <h3 className="text-ink-muted font-mono text-[11px] tracking-wider uppercase">
                Authors ({authorSet.size})
              </h3>
              <ul className="mt-3 space-y-1">
                {[...authorSet].slice(0, 30).map((id) => (
                  <li key={id} className="text-ink font-mono text-xs">
                    {id}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  )
}

function TopicHeader({
  tag,
  count,
}: {
  tag: { slug: string; label: string }
  count: number
}) {
  return (
    <header className="mb-8">
      <Link
        href="/app/topics"
        className="text-ink-muted font-mono text-xs tracking-wider uppercase hover:underline inline-flex items-center gap-1"
      >
        <ArrowLeft size={12} weight="regular" aria-hidden />
        all topics
      </Link>
      <h1 className="font-display text-ink mt-2 text-3xl">{tag.label}</h1>
      <p className="text-ink-muted mt-1 font-mono text-[11px] tracking-wider uppercase">
        {tag.slug} · {count} briefing{count === 1 ? '' : 's'}
      </p>
    </header>
  )
}
