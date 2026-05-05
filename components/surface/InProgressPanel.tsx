import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { agentRuns } from '@/db/schema'

export async function InProgressPanel({ userId }: { userId: string }) {
  const runs = await db
    .select({
      id: agentRuns.id,
      agent: agentRuns.agent,
      startedAt: agentRuns.startedAt,
      goalId: agentRuns.goalId,
    })
    .from(agentRuns)
    .where(and(eq(agentRuns.userId, userId), eq(agentRuns.status, 'running')))
    .orderBy(desc(agentRuns.startedAt))
    .limit(4)

  if (runs.length === 0) return null

  return (
    <section className="bg-surface border-border-subtle rounded-2xl border p-5">
      <h2 className="text-ink-muted font-mono text-[11px] tracking-wider uppercase">
        In progress
      </h2>
      <ul className="mt-3 space-y-2 text-sm">
        {runs.map((r) => (
          <li key={r.id} className="flex items-center justify-between">
            <span className="text-ink-muted font-mono text-xs uppercase">
              {r.agent}
            </span>
            <span className="text-ink-muted font-mono text-[11px]">
              {r.startedAt.toISOString().slice(11, 16)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
