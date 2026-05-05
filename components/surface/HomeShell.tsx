import Link from 'next/link'
import type { User } from '@/db/schema'
import { BriefingCard } from './BriefingCard'
import { Sidebar } from './Sidebar'
import {
  PRIORITY_FILTERS,
  type BriefingWithDetail,
  type PriorityFilter,
} from './types'

export function HomeShell({
  user,
  feed,
  filter,
  total,
  byPriority,
  thisWeek,
}: {
  user: User
  feed: BriefingWithDetail[]
  filter: PriorityFilter
  total: number
  byPriority: Record<string, number>
  thisWeek: number
}) {
  return (
    <>
      <header className="mb-8">
        <p className="text-ink-muted font-mono text-xs tracking-wider uppercase">
          today&apos;s briefing
        </p>
        <h1 className="font-display text-ink mt-1 text-3xl">
          Hello, {user.name ?? 'researcher'}.
        </h1>
        {total > 0 ? (
          <p className="text-ink-muted mt-2 text-sm">
            {total} briefing{total === 1 ? '' : 's'} on your desk.
          </p>
        ) : null}
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <main>
          <FilterChips active={filter} byPriority={byPriority} total={total} />
          {feed.length === 0 ? (
            <EmptyState filter={filter} />
          ) : (
            <ul className="mt-6 space-y-3">
              {feed.map((b) => (
                <li key={b.briefing.id} className="relative">
                  <BriefingCard data={b} />
                </li>
              ))}
            </ul>
          )}
        </main>
        <Sidebar user={user} briefingsThisWeek={thisWeek} />
      </div>
    </>
  )
}

function FilterChips({
  active,
  byPriority,
  total,
}: {
  active: PriorityFilter
  byPriority: Record<string, number>
  total: number
}) {
  return (
    <nav
      className="flex flex-wrap gap-2"
      aria-label="Filter briefings by priority"
    >
      {PRIORITY_FILTERS.map((f) => {
        const count = f.key === 'all' ? total : (byPriority[f.key] ?? 0)
        const isActive = f.key === active
        const href = f.key === 'all' ? '/app' : `/app?priority=${f.key}`
        return (
          <Link
            key={f.key}
            href={href}
            data-active={isActive}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition data-[active=true]:bg-ink data-[active=true]:text-surface data-[active=true]:border-ink ${
              isActive
                ? ''
                : 'text-ink-muted border-border-subtle hover:text-ink hover:bg-accent-soft'
            }`}
          >
            <span>{f.label}</span>
            <span className="font-mono opacity-70">{count}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function EmptyState({ filter }: { filter: PriorityFilter }) {
  return (
    <section className="bg-surface border-border-subtle mt-6 rounded-2xl border p-8">
      <h2 className="font-display text-ink text-xl">
        {filter === 'all'
          ? 'No briefings yet.'
          : `No ${filter} briefings right now.`}
      </h2>
      <p className="text-ink-muted mt-2 text-sm leading-relaxed">
        {filter === 'all'
          ? 'Once a goal runs, briefings will appear here. You can preview a goal manually from its page.'
          : 'Try a different filter, or wait for the next pipeline run.'}
      </p>
      <div className="mt-5 flex items-center gap-4">
        <Link
          href="/app/goals"
          className="bg-ink text-surface hover:bg-ink/90 inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition"
        >
          Manage goals
        </Link>
        {filter !== 'all' ? (
          <Link
            href="/app"
            className="text-ink-muted hover:text-ink text-sm"
          >
            Show all
          </Link>
        ) : null}
      </div>
    </section>
  )
}
