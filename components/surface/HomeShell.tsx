import Link from 'next/link'
import { HandPointing } from '@phosphor-icons/react/dist/ssr'
import type { User } from '@/db/schema'
import { BriefingCard } from './BriefingCard'
import { Sidebar } from './Sidebar'
import {
  PRIORITY_FILTERS,
  type BriefingWithDetail,
  type PriorityFilter,
} from './types'

const FILTER_INK: Record<PriorityFilter, string> = {
  all: 'text-ink-muted',
  critical: 'text-card-ink-critical',
  process: 'text-card-ink-process',
  opportunity: 'text-card-ink-opportunity',
  signal: 'text-card-ink-signal',
}

const FILTER_LABEL: Record<PriorityFilter, string> = {
  all: 'All',
  critical: 'Priority',
  process: 'Process',
  opportunity: 'Opportunities',
  signal: 'Signals',
}

export function HomeShell({
  user,
  feed,
  filter,
  total,
  byPriority,
  savedCount,
}: {
  user: User
  feed: BriefingWithDetail[]
  filter: PriorityFilter
  total: number
  byPriority: Record<string, number>
  savedCount: number
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <main>
        <FilterChips active={filter} byPriority={byPriority} total={total} />
        {feed.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {feed.map((b) => (
              <li key={b.briefing.id} className="relative">
                <BriefingCard data={b} />
              </li>
            ))}
          </ul>
        )}
      </main>
      <Sidebar user={user} savedCount={savedCount} />
    </div>
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
      className="text-ink-muted flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"
      aria-label="Filter briefings by priority"
    >
      <span className="text-ink/80 inline-flex items-center gap-1.5 font-medium">
        <HandPointing size={16} weight="regular" aria-hidden />
        Suggested Actions
      </span>
      {PRIORITY_FILTERS.map((f) => {
        const count = f.key === 'all' ? total : (byPriority[f.key] ?? 0)
        const isActive = f.key === active
        const href = f.key === 'all' ? '/app' : `/app?priority=${f.key}`
        const inkClass = FILTER_INK[f.key]
        const label = FILTER_LABEL[f.key]
        return (
          <Link
            key={f.key}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            data-active={isActive}
            className="hover:text-ink focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 data-[active=true]:underline underline-offset-4"
          >
            {f.key === 'all' ? null : (
              <span className={`${inkClass} font-medium`}>{count}</span>
            )}
            <span className={isActive ? inkClass : ''}>{label}</span>
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
