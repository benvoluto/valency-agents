import Link from 'next/link'
import { ArrowRight } from '@phosphor-icons/react/dist/ssr'
import { desc, eq, sql } from 'drizzle-orm'
import { requireOnboardedUser } from '@/lib/auth-helpers'
import { db } from '@/db'
import { briefingTags, briefings, tags } from '@/db/schema'

export default async function TopicsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>
}) {
  const user = await requireOnboardedUser()
  const { sort } = await searchParams
  const sortBy = sort === 'count' ? 'count' : 'recency'

  const rows = await db
    .select({
      id: tags.id,
      slug: tags.slug,
      label: tags.label,
      briefingCount: sql<number>`count(distinct ${briefingTags.briefingId})::int`,
      latestAt: sql<Date>`max(${briefings.createdAt})`,
    })
    .from(tags)
    .innerJoin(briefingTags, eq(briefingTags.tagId, tags.id))
    .innerJoin(briefings, eq(briefings.id, briefingTags.briefingId))
    .where(eq(briefings.userId, user.id))
    .groupBy(tags.id, tags.slug, tags.label)
    .orderBy(
      sortBy === 'count'
        ? desc(sql`count(distinct ${briefingTags.briefingId})`)
        : desc(sql`max(${briefings.createdAt})`),
    )
    .limit(100)

  return (
    <>
      <header className="mb-8">
        <p className="text-ink-muted font-mono text-xs tracking-wider uppercase">
          topics
        </p>
        <h1 className="font-display text-ink mt-1 text-3xl">
          Tags from your briefings.
        </h1>
        <p className="text-ink-muted mt-2 text-sm leading-relaxed">
          The Librarian agent assembles these from each pipeline run. Click
          one to see every briefing under it.
        </p>
      </header>

      <nav
        className="mb-6 flex items-center gap-3 text-xs"
        aria-label="Sort topics"
      >
        <span className="text-ink-muted font-mono uppercase tracking-wider">
          Sort:
        </span>
        <SortChip active={sortBy === 'recency'} href="/app/topics" label="Recent" />
        <SortChip
          active={sortBy === 'count'}
          href="/app/topics?sort=count"
          label="Most briefings"
        />
      </nav>

      {rows.length === 0 ? (
        <section className="bg-surface border-border-subtle rounded-2xl border p-8">
          <p className="text-ink-muted text-sm">
            No tags yet. Tags appear here as soon as the agent pipeline writes
            its first briefing for one of your goals.
          </p>
        </section>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rows.map((t) => (
            <li key={t.id}>
              <Link
                href={`/app/topics/${t.slug}`}
                className="bg-surface border-border-subtle hover:border-accent flex items-center justify-between gap-4 rounded-2xl border p-5 transition"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-ink font-medium leading-tight">
                    {t.label}
                  </p>
                  <p className="text-ink-muted mt-1 font-mono text-[11px] tracking-wider uppercase">
                    {t.slug}
                  </p>
                  <p className="text-ink-muted mt-2 text-xs">
                    {t.briefingCount} briefing{t.briefingCount === 1 ? '' : 's'}{' '}
                    · last seen{' '}
                    {t.latestAt instanceof Date
                      ? t.latestAt.toISOString().slice(0, 10)
                      : String(t.latestAt).slice(0, 10)}
                  </p>
                </div>
                <ArrowRight
                  size={14}
                  weight="regular"
                  aria-hidden
                  className="text-ink-muted shrink-0"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function SortChip({
  active,
  href,
  label,
}: {
  active: boolean
  href: string
  label: string
}) {
  return (
    <Link
      href={href}
      data-active={active}
      className={`inline-flex items-center rounded-full border px-3 py-1 transition data-[active=true]:bg-ink data-[active=true]:text-surface data-[active=true]:border-ink ${
        active
          ? ''
          : 'text-ink-muted border-border-subtle hover:text-ink hover:bg-accent-soft'
      }`}
    >
      {label}
    </Link>
  )
}
