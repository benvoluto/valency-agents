import Link from 'next/link'
import { ArrowRight } from '@phosphor-icons/react/dist/ssr'
import { desc, eq, inArray, sql } from 'drizzle-orm'
import { requireOnboardedUser } from '@/lib/auth-helpers'
import { db } from '@/db'
import { goals, goalSeeds } from '@/db/schema'

export default async function GoalsList() {
  const user = await requireOnboardedUser()

  const goalRows = await db
    .select({
      id: goals.id,
      title: goals.title,
      description: goals.description,
      status: goals.status,
      cadence: goals.cadence,
      createdAt: goals.createdAt,
    })
    .from(goals)
    .where(eq(goals.userId, user.id))
    .orderBy(desc(goals.createdAt))

  // Counting seeds via a correlated subquery in the goals select returned
  // bigint-as-string and didn't render — fetch separately and map by id.
  const seedCounts =
    goalRows.length === 0
      ? []
      : await db
          .select({
            goalId: goalSeeds.goalId,
            n: sql<number>`count(*)::int`,
          })
          .from(goalSeeds)
          .where(
            inArray(
              goalSeeds.goalId,
              goalRows.map((g) => g.id),
            ),
          )
          .groupBy(goalSeeds.goalId)
  const seedCountByGoal = new Map(seedCounts.map((s) => [s.goalId, Number(s.n)]))
  const rows = goalRows.map((g) => ({
    ...g,
    seedCount: seedCountByGoal.get(g.id) ?? 0,
  }))

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
                  <ArrowRight size={14} className="text-ink-muted" aria-hidden />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
