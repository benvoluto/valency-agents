import Link from 'next/link'
import { ArrowRight } from '@phosphor-icons/react/dist/ssr'
import { and, desc, eq, inArray, or } from 'drizzle-orm'
import { requireOnboardedUser } from '@/lib/auth-helpers'
import { db } from '@/db'
import { briefings, follows, papers } from '@/db/schema'
import { CategoryIcon } from '@/components/surface/CategoryIcon'
import { ConfidenceChip } from '@/components/surface/ConfidenceChip'

export default async function LibraryPage() {
  const user = await requireOnboardedUser()

  const saved = await db
    .select()
    .from(briefings)
    .where(
      and(
        eq(briefings.userId, user.id),
        or(eq(briefings.status, 'acted'), eq(briefings.status, 'approved')),
      ),
    )
    .orderBy(desc(briefings.createdAt))
    .limit(50)

  const userFollows = await db
    .select()
    .from(follows)
    .where(eq(follows.userId, user.id))
    .orderBy(desc(follows.createdAt))

  const paperFollows = userFollows.filter((f) => f.kind === 'paper')
  const authorFollows = userFollows.filter((f) => f.kind === 'author')

  const paperRefs = paperFollows.map((f) => f.refId)
  const knownPapers =
    paperRefs.length > 0
      ? await db
          .select({ id: papers.id, title: papers.title })
          .from(papers)
          .where(inArray(papers.id, paperRefs))
      : []
  const titleByPaperId = new Map(knownPapers.map((p) => [p.id, p.title]))

  const isEmpty =
    saved.length === 0 && paperFollows.length === 0 && authorFollows.length === 0

  return (
    <>
      <header className="mb-8">
        <p className="text-ink-muted font-mono text-xs tracking-wider uppercase">
          library
        </p>
        <h1 className="font-display text-ink mt-1 text-3xl">
          What you&apos;ve saved.
        </h1>
      </header>

      {isEmpty ? (
        <section className="bg-surface border-border-subtle rounded-2xl border p-8">
          <p className="text-ink-muted text-sm">
            Your library is empty. Save a briefing from the feed and it will
            appear here.
          </p>
          <Link
            href="/app"
            className="text-accent mt-3 inline-flex items-center gap-1 text-sm hover:underline"
          >
            Back to feed
            <ArrowRight size={14} weight="regular" aria-hidden />
          </Link>
        </section>
      ) : null}

      {saved.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-ink-muted font-mono text-[11px] tracking-wider uppercase">
            Saved briefings ({saved.length})
          </h2>
          <ul className="mt-3 space-y-3">
            {saved.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/app/briefings/${b.id}`}
                  className="bg-surface border-border-subtle hover:border-accent flex items-start gap-4 rounded-2xl border p-4 transition"
                >
                  <CategoryIcon kind={b.kind} />
                  <div className="min-w-0 flex-1">
                    <p className="text-ink font-medium leading-snug">
                      {b.title}
                    </p>
                    <div className="text-ink-muted mt-2 flex items-center gap-3 text-xs">
                      <ConfidenceChip confidence={b.confidence} />
                      <span className="font-mono uppercase">{b.status}</span>
                      <span className="font-mono">
                        {b.createdAt.toISOString().slice(0, 10)}
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {paperFollows.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-ink-muted font-mono text-[11px] tracking-wider uppercase">
            Followed papers ({paperFollows.length})
          </h2>
          <ul className="mt-3 space-y-2">
            {paperFollows.map((f) => (
              <li
                key={f.refId}
                className="bg-surface border-border-subtle rounded-md border px-3 py-2 text-sm"
              >
                <span className="text-ink-muted font-mono text-xs">
                  {f.refId}
                </span>{' '}
                <span className="text-ink">
                  {titleByPaperId.get(f.refId) ?? f.label ?? ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {authorFollows.length > 0 ? (
        <section>
          <h2 className="text-ink-muted font-mono text-[11px] tracking-wider uppercase">
            Followed authors ({authorFollows.length})
          </h2>
          <ul className="mt-3 space-y-2">
            {authorFollows.map((f) => (
              <li
                key={f.refId}
                className="bg-surface border-border-subtle rounded-md border px-3 py-2 text-sm"
              >
                <span className="text-ink-muted font-mono text-xs">
                  {f.refId}
                </span>{' '}
                <span className="text-ink">{f.label ?? ''}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}
