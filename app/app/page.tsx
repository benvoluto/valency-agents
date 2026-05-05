import Link from 'next/link'
import { eq, desc } from 'drizzle-orm'
import { requireOnboardedUser } from '@/lib/auth-helpers'
import { db } from '@/db'
import { goals } from '@/db/schema'

export default async function AppHome() {
  const user = await requireOnboardedUser()
  const userGoals = await db
    .select()
    .from(goals)
    .where(eq(goals.userId, user.id))
    .orderBy(desc(goals.createdAt))

  return (
    <>
      <header className="mb-10">
        <p className="text-ink-muted font-mono text-xs tracking-wider uppercase">
          today&apos;s briefing
        </p>
        <h1 className="font-display text-ink mt-1 text-3xl">
          Hello, {user.name ?? 'researcher'}.
        </h1>
        {user.affiliation ? (
          <p className="text-ink-muted mt-1 text-sm">{user.affiliation}</p>
        ) : null}
      </header>

      <section className="bg-surface border-border-subtle rounded-2xl border p-8">
        <h2 className="font-display text-ink text-xl">No briefings yet.</h2>
        <p className="text-ink-muted mt-2 text-sm leading-relaxed">
          The agent team isn&apos;t wired up until Phase 4. In the meantime,
          your goals are configured and ready — once the pipeline runs, the
          briefings will appear here.
        </p>
        <div className="mt-5 flex items-center gap-4">
          <Link
            href="/app/goals"
            className="bg-ink text-surface hover:bg-ink/90 inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition"
          >
            Manage goals ({userGoals.length})
          </Link>
          <Link
            href="/app/settings"
            className="text-ink-muted hover:text-ink text-sm"
          >
            Settings
          </Link>
        </div>
      </section>
    </>
  )
}
