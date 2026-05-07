import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from '@phosphor-icons/react/dist/ssr'
import { and, eq, inArray } from 'drizzle-orm'
import { requireOnboardedUser } from '@/lib/auth-helpers'
import { db } from '@/db'
import {
  briefingProvenance,
  briefingSources,
  briefingTags,
  briefings,
  goals,
  papers,
  tags,
} from '@/db/schema'
import { CategoryIcon } from '@/components/surface/CategoryIcon'
import { ConfidenceChip } from '@/components/surface/ConfidenceChip'
import { PriorityBadge } from '@/components/surface/PriorityBadge'
import { AuditTrail } from '@/components/surface/AuditTrail'
import { BriefingActionPanel } from '@/components/surface/BriefingActionPanel'

const SOURCE_KIND_LABEL: Record<string, string> = {
  paper: 'Paper',
  author: 'Author',
  query: 'Query',
  tool_call: 'Tool',
  web: 'Web',
}

function band(c: number): string {
  if (c >= 0.9) return 'High'
  if (c >= 0.7) return 'Medium'
  return 'Low'
}

export default async function BriefingDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireOnboardedUser()
  const { id } = await params

  const [briefing] = await db
    .select()
    .from(briefings)
    .where(and(eq(briefings.id, id), eq(briefings.userId, user.id)))
    .limit(1)
  if (!briefing) notFound()

  const goal = briefing.goalId
    ? (
        await db
          .select({ id: goals.id, title: goals.title })
          .from(goals)
          .where(eq(goals.id, briefing.goalId))
          .limit(1)
      )[0] ?? null
    : null

  const [provenance] = await db
    .select()
    .from(briefingProvenance)
    .where(eq(briefingProvenance.briefingId, id))
    .limit(1)

  const sources = await db
    .select()
    .from(briefingSources)
    .where(eq(briefingSources.briefingId, id))

  const briefingTagRows = await db
    .select({ tag: tags })
    .from(briefingTags)
    .innerJoin(tags, eq(tags.id, briefingTags.tagId))
    .where(eq(briefingTags.briefingId, id))

  // Resolve paper-source titles when we already have them in the corpus.
  const paperRefs = sources
    .filter((s) => s.kind === 'paper')
    .map((s) => s.refId)
  const paperRows =
    paperRefs.length > 0
      ? await db
          .select({ id: papers.id, title: papers.title })
          .from(papers)
          .where(inArray(papers.id, paperRefs))
      : []
  const paperTitleById = new Map(paperRows.map((p) => [p.id, p.title]))

  const alternatives =
    (provenance?.alternativesConsideredJson as unknown[] | null | undefined) ??
    []
  const scope = (provenance?.scopeJson ?? null) as Record<string, unknown> | null

  return (
    <>
      <header className="mb-8">
        <Link
          href="/app"
          className="text-ink-muted font-mono text-xs tracking-wider uppercase hover:underline inline-flex items-center gap-1"
        >
          <ArrowLeft size={12} weight="regular" aria-hidden />
          today&apos;s briefing
        </Link>
        <div className="mt-3 flex items-start gap-4">
          <CategoryIcon kind={briefing.kind} size={48} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <ConfidenceChip confidence={briefing.confidence} />
              <PriorityBadge priority={briefing.priority} />
              <span className="text-ink-muted font-mono text-[11px] uppercase">
                {briefing.kind.replace(/_/g, ' ')}
              </span>
            </div>
            <h1 className="font-display text-ink mt-2 text-3xl leading-tight">
              {briefing.title}
            </h1>
            {goal ? (
              <p className="text-ink-muted mt-2 text-sm">
                From your goal{' '}
                <Link
                  href={`/app/goals/${goal.id}`}
                  className="text-accent hover:underline"
                >
                  {goal.title}
                </Link>
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <section className="bg-surface border-border-subtle mb-6 rounded-2xl border p-6">
        <h2 className="text-ink-muted font-mono text-[11px] tracking-wider uppercase">
          Summary
        </h2>
        <p className="text-ink mt-2 text-base leading-relaxed">
          {briefing.summary}
        </p>
        {briefingTagRows.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {briefingTagRows.map(({ tag }) => (
              <li
                key={tag.id}
                className="bg-accent-soft text-accent rounded-full px-2 py-0.5 font-mono text-[11px]"
              >
                {tag.label}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="bg-surface border-border-subtle mb-6 rounded-2xl border p-6">
        <h2 className="text-ink-muted font-mono text-[11px] tracking-wider uppercase">
          Why this surfaced
        </h2>
        {provenance?.reasoning ? (
          <p className="text-ink mt-2 text-sm leading-relaxed whitespace-pre-line">
            {provenance.reasoning}
          </p>
        ) : (
          <p className="text-ink-muted mt-2 text-sm italic">
            No reasoning recorded for this briefing.
          </p>
        )}
      </section>

      <section className="bg-surface border-border-subtle mb-6 rounded-2xl border p-6">
        <h2 className="text-ink-muted font-mono text-[11px] tracking-wider uppercase">
          What I looked at ({sources.length})
        </h2>
        {sources.length === 0 ? (
          <p className="text-ink-muted mt-2 text-sm italic">No sources.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sources.map((s) => (
              <li
                key={s.id}
                id={`source-${s.id}`}
                data-testid="source-row"
                className="border-border-subtle rounded-md border p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-ink-muted font-mono text-[10px] uppercase">
                    {SOURCE_KIND_LABEL[s.kind] ?? s.kind}
                  </span>
                  <span className="text-ink font-mono text-xs">{s.refId}</span>
                  <span className="text-ink-muted ml-auto font-mono text-[10px]">
                    weight {s.weight.toFixed(2)}
                  </span>
                </div>
                {s.kind === 'paper' && paperTitleById.has(s.refId) ? (
                  <p className="text-ink mt-1 text-sm">
                    {paperTitleById.get(s.refId)}
                  </p>
                ) : null}
                {s.snippet ? (
                  <p className="text-ink-muted mt-1 line-clamp-2 text-xs leading-relaxed">
                    {s.snippet}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-surface border-border-subtle mb-6 rounded-2xl border p-6">
        <h2 className="text-ink-muted font-mono text-[11px] tracking-wider uppercase">
          Confidence
        </h2>
        <div className="mt-3 flex items-baseline gap-3">
          <ConfidenceChip confidence={briefing.confidence} />
          <span className="text-ink-muted text-sm">
            {band(briefing.confidence)} ·{' '}
            {Math.round(briefing.confidence * 100)}% — see sources for the
            calibration.
          </span>
        </div>
      </section>

      <section className="bg-surface border-border-subtle mb-6 rounded-2xl border p-6">
        <h2 className="text-ink-muted font-mono text-[11px] tracking-wider uppercase">
          What I will and won&apos;t do
        </h2>
        {provenance?.whatIWillDo ? (
          <p className="text-ink mt-2 text-sm leading-relaxed whitespace-pre-line">
            {provenance.whatIWillDo}
          </p>
        ) : (
          <p className="text-ink-muted mt-2 text-sm italic">
            No action plan recorded.
          </p>
        )}
        {alternatives.length > 0 ? (
          <>
            <h3 className="text-ink-muted mt-5 font-mono text-[11px] tracking-wider uppercase">
              Alternatives considered
            </h3>
            <ul className="text-ink mt-2 list-disc pl-5 text-sm leading-relaxed">
              {alternatives.map((a, i) => (
                <li key={i}>{String(a)}</li>
              ))}
            </ul>
          </>
        ) : null}
        {scope && Object.keys(scope).length > 0 ? (
          <>
            <h3 className="text-ink-muted mt-5 font-mono text-[11px] tracking-wider uppercase">
              Scope
            </h3>
            <pre className="bg-bg mt-2 overflow-auto rounded-md p-3 font-mono text-xs">
              {JSON.stringify(scope, null, 2)}
            </pre>
          </>
        ) : null}
      </section>

      <section className="bg-surface border-border-subtle mb-6 rounded-2xl border p-6">
        <h2 className="text-ink-muted font-mono text-[11px] tracking-wider uppercase">
          Actions
        </h2>
        <div className="mt-4">
          <BriefingActionPanel briefing={briefing} variant="detail" />
        </div>
      </section>

      <section className="bg-surface border-border-subtle rounded-2xl border p-6">
        <h2 className="text-ink-muted font-mono text-[11px] tracking-wider uppercase">
          Audit timeline
        </h2>
        <div className="mt-3">
          <AuditTrail briefingId={briefing.id} />
        </div>
      </section>
    </>
  )
}
