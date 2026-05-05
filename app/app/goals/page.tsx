import Link from 'next/link'
import { desc, eq, sql } from 'drizzle-orm'
import { requireOnboardedUser } from '@/lib/auth-helpers'
import { db } from '@/db'
import { goals, goalSeeds } from '@/db/schema'

export default async function GoalsList() {
  const user = await requireOnboardedUser()

  const rows = await db
    .select({
      id: goals.id,
      title: goals.title,
      description: goals.description,
      status: goals.status,
      cadence: goals.cadence,
      createdAt: goals.createdAt,
      seedCount: sql<number>`(select count(*) from ${goalSeeds} where ${goalSeeds.goalId} = ${goals.id})`.as('seed_count'),
    })
    .from(goals)
    .where(eq(goals.userId, user.id))
    .orderBy(desc(goals.createdAt))

  return (
    <>
      <header className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-ink-muted font-mono text-xs tracking-wider uppercase">
            goals
          </p>
          <h1 className="font-display text-ink mt-1 text-3xl">
            What you&apos;re tracking.
          </h1>
        </div>
        <Link
          href="/app/goals/new"
          className="bg-ink text-surface hover:bg-ink/90 inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition"
        >
          New goal
        </Link>
      </header>

      {rows.length === 0 ? (
        <section className="bg-surface border-border-subtle rounded-2xl border p-8">
          <p className="text-ink-muted text-sm">
            No goals yet. <Link href="/app/goals/new" className="text-accent underline">Create one</Link> to get started.
          </p>
        </section>
      ) : (
        <ul className="space-y-3">
          {rows.map((g) => (
            <li
              key={g.id}
              className="bg-surface border-border-subtle rounded-2xl border p-6"
            >
              <Link href={`/app/goals/${g.id}`} className="block">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-display text-ink text-lg leading-tight">
                      {g.title}
                    </h2>
                    {g.description ? (
                      <p className="text-ink-muted mt-1 text-sm">
                        {g.description}
                      </p>
                    ) : null}
                    <div className="text-ink-muted mt-3 flex items-center gap-3 text-xs">
                      <span className="font-mono uppercase">{g.status}</span>
                      <span>·</span>
                      <span>cadence: {g.cadence}</span>
                      <span>·</span>
                      <span>{g.seedCount} seed{g.seedCount === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                  <span className="text-ink-muted text-xs">→</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
