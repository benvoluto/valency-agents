import { sql } from 'drizzle-orm'
import { requireAdminUser } from '@/lib/admin'
import { db } from '@/db'
import { agentRuns, threads, users } from '@/db/schema'

export const dynamic = 'force-dynamic'

interface SpendRow {
  email: string | null
  name: string | null
  pipelineUsd: number
  chatUsd: number
  totalUsd: number
  agentRunCount: number
  threadCount: number
}

export default async function AdminSpendPage() {
  await requireAdminUser()

  const [runRows, threadRows, totals] = await Promise.all([
    db
      .select({
        userId: agentRuns.userId,
        usd: sql<number>`coalesce(sum(${agentRuns.costUsd}), 0)`,
        runs: sql<number>`count(*)::int`,
      })
      .from(agentRuns)
      .where(sql`${agentRuns.startedAt} >= now() - interval '7 days'`)
      .groupBy(agentRuns.userId),
    db
      .select({
        userId: threads.userId,
        usd: sql<number>`coalesce(sum(${threads.costUsd}), 0)`,
        threads: sql<number>`count(*)::int`,
      })
      .from(threads)
      .where(sql`${threads.lastMessageAt} >= now() - interval '7 days'`)
      .groupBy(threads.userId),
    db.select({ id: users.id, email: users.email, name: users.name }).from(users),
  ])

  const runById = new Map(runRows.map((r) => [r.userId, r]))
  const threadById = new Map(threadRows.map((r) => [r.userId, r]))

  const merged: SpendRow[] = totals
    .map((u) => {
      const r = runById.get(u.id)
      const t = threadById.get(u.id)
      const pipelineUsd = Number(r?.usd ?? 0)
      const chatUsd = Number(t?.usd ?? 0)
      return {
        email: u.email,
        name: u.name,
        pipelineUsd,
        chatUsd,
        totalUsd: pipelineUsd + chatUsd,
        agentRunCount: Number(r?.runs ?? 0),
        threadCount: Number(t?.threads ?? 0),
      }
    })
    .filter((r) => r.totalUsd > 0)
    .sort((a, b) => b.totalUsd - a.totalUsd)

  const grandTotal = merged.reduce((sum, r) => sum + r.totalUsd, 0)
  const pipelineTotal = merged.reduce((sum, r) => sum + r.pipelineUsd, 0)
  const chatTotal = merged.reduce((sum, r) => sum + r.chatUsd, 0)

  return (
    <>
      <header className="mb-6">
        <p className="text-ink-muted font-mono text-xs tracking-wider uppercase">
          admin · last 7 days
        </p>
        <h1 className="font-display text-ink mt-1 text-3xl">
          Anthropic spend.
        </h1>
        <p className="text-ink-muted mt-1 font-mono text-[11px]">
          Updated live. Restricted to ADMIN_EMAILS.
        </p>
      </header>

      <section className="bg-surface border-border-subtle mb-6 rounded-2xl border p-6">
        <div className="grid grid-cols-3 gap-6">
          <Stat label="Pipeline" value={`$${pipelineTotal.toFixed(2)}`} />
          <Stat label="Chat" value={`$${chatTotal.toFixed(2)}`} />
          <Stat label="Total" value={`$${grandTotal.toFixed(2)}`} tone="ink" />
        </div>
      </section>

      <section className="bg-surface border-border-subtle rounded-2xl border p-6">
        <h2 className="text-ink-muted font-mono text-[11px] tracking-wider uppercase">
          By user
        </h2>
        {merged.length === 0 ? (
          <p className="text-ink-muted mt-3 text-sm italic">
            No paid activity in the last 7 days.
          </p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-ink-muted text-left text-[11px] font-mono uppercase">
                <th className="py-2">User</th>
                <th className="py-2">Pipeline</th>
                <th className="py-2">Chat</th>
                <th className="py-2">Runs</th>
                <th className="py-2">Threads</th>
                <th className="py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {merged.map((r) => (
                <tr key={r.email ?? r.name ?? 'anon'} className="border-border-subtle border-t">
                  <td className="py-2">
                    <div className="text-ink">{r.name ?? '(no name)'}</div>
                    <div className="text-ink-muted font-mono text-[11px]">
                      {r.email ?? ''}
                    </div>
                  </td>
                  <td className="text-ink py-2 font-mono text-xs">
                    ${r.pipelineUsd.toFixed(4)}
                  </td>
                  <td className="text-ink py-2 font-mono text-xs">
                    ${r.chatUsd.toFixed(4)}
                  </td>
                  <td className="text-ink-muted py-2 font-mono text-xs">
                    {r.agentRunCount}
                  </td>
                  <td className="text-ink-muted py-2 font-mono text-xs">
                    {r.threadCount}
                  </td>
                  <td className="text-ink py-2 font-mono text-sm">
                    ${r.totalUsd.toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'ink' | 'muted'
}) {
  return (
    <div>
      <p className="text-ink-muted font-mono text-[11px] tracking-wider uppercase">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl ${tone === 'ink' ? 'text-ink' : 'text-ink'}`}
      >
        {value}
      </p>
    </div>
  )
}
