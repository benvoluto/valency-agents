import Link from 'next/link'
import { ArrowRight } from '@phosphor-icons/react/dist/ssr'
import type { User } from '@/db/schema'
import { AskAnything } from './AskAnything'
import { QuickActions } from './QuickActions'
import { InProgressPanel } from './InProgressPanel'

export async function Sidebar({
  user,
  briefingsThisWeek,
}: {
  user: User
  briefingsThisWeek: number
}) {
  const initial = (user.name ?? user.email ?? '?').slice(0, 1).toUpperCase()
  return (
    <aside className="space-y-6">
      <section className="bg-surface border-border-subtle rounded-2xl border p-5">
        <div className="flex items-start gap-3">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt=""
              className="h-12 w-12 rounded-full object-cover"
            />
          ) : (
            <div className="bg-accent-soft text-accent flex h-12 w-12 items-center justify-center rounded-full text-base font-medium">
              {initial}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-ink font-display text-base leading-tight">
              {user.name ?? user.email ?? 'researcher'}
            </p>
            {user.affiliation ? (
              <p className="text-ink-muted mt-0.5 text-xs">{user.affiliation}</p>
            ) : null}
            {user.orcid ? (
              <p className="text-ink-muted mt-0.5 font-mono text-[11px]">
                {user.orcid}
              </p>
            ) : null}
          </div>
        </div>
        <div className="border-border-subtle mt-4 flex items-baseline justify-between border-t pt-3 text-xs">
          <span className="text-ink-muted">briefings this week</span>
          <span className="text-ink font-mono">{briefingsThisWeek}</span>
        </div>
        <Link
          href="/app/settings"
          className="text-ink-muted hover:text-ink mt-3 inline-flex items-center gap-1 text-xs"
        >
          Edit profile <ArrowRight size={12} weight="regular" aria-hidden />
        </Link>
      </section>

      <AskAnything />
      <QuickActions />
      <InProgressPanel userId={user.id} />
    </aside>
  )
}
