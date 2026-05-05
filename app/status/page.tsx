import { desc, sql } from 'drizzle-orm'
import { db } from '@/db'
import { healthChecks } from '@/db/schema'

export const dynamic = 'force-dynamic'

interface CheckRow {
  ts: Date
  db: string
  anthropic: string
  valency: string
  dbLatencyMs: number | null
  anthropicLatencyMs: number | null
  valencyLatencyMs: number | null
}

const COMPONENTS: { key: 'db' | 'anthropic' | 'valency'; label: string }[] = [
  { key: 'db', label: 'Database' },
  { key: 'anthropic', label: 'Anthropic API' },
  { key: 'valency', label: 'Valency MCP' },
]

export default async function StatusPage() {
  // Cutoff is computed in SQL to keep the render path side-effect free.
  const rows: CheckRow[] = await db
    .select()
    .from(healthChecks)
    .where(sql`${healthChecks.ts} >= now() - interval '24 hours'`)
    .orderBy(desc(healthChecks.ts))
    .limit(300)

  const overall = COMPONENTS.map((c) => {
    if (rows.length === 0)
      return { ...c, uptime: null as number | null, last: 'unknown', latency: null }
    const total = rows.length
    const up = rows.filter((r) => r[c.key] === 'ok').length
    const last = rows[0][c.key]
    const latency =
      rows.find((r) => r[`${c.key}LatencyMs` as keyof CheckRow] !== null)?.[
        `${c.key}LatencyMs` as keyof CheckRow
      ] ?? null
    return {
      ...c,
      uptime: up / total,
      last,
      latency: typeof latency === 'number' ? latency : null,
    }
  })

  return (
    <main
      id="main"
      className="bg-bg min-h-screen px-4 py-8 sm:px-6 sm:py-12"
    >
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <p className="text-ink-muted font-mono text-xs tracking-wider uppercase">
            researchagents.io · status
          </p>
          <h1 className="font-display text-ink mt-1 text-3xl">
            Live status, last 24h.
          </h1>
        </header>

        <section className="space-y-3">
          {overall.map((c) => (
            <article
              key={c.key}
              className="bg-surface border-border-subtle rounded-2xl border p-5"
              data-testid={`status-${c.key}`}
            >
              <header className="flex items-baseline justify-between">
                <h2 className="text-ink text-base font-medium">{c.label}</h2>
                <span
                  className={`font-mono text-[11px] tracking-wider uppercase ${c.last === 'ok' ? 'text-priority-opportunity' : 'text-priority-critical'}`}
                  data-testid={`status-${c.key}-state`}
                >
                  {c.last}
                </span>
              </header>
              <div className="mt-2 flex items-center gap-4 font-mono text-[11px]">
                <span className="text-ink-muted">
                  uptime:{' '}
                  {c.uptime === null
                    ? '—'
                    : `${(c.uptime * 100).toFixed(1)}%`}
                </span>
                {c.latency !== null ? (
                  <span className="text-ink-muted">latency: {c.latency}ms</span>
                ) : null}
              </div>
              <Strip rows={rows} component={c.key} />
            </article>
          ))}
        </section>

        {rows.length === 0 ? (
          <p className="text-ink-muted mt-6 text-sm italic">
            No probes yet. The Inngest cron runs every 5 minutes.
          </p>
        ) : null}
      </div>
    </main>
  )
}

function Strip({
  rows,
  component,
}: {
  rows: CheckRow[]
  component: 'db' | 'anthropic' | 'valency'
}) {
  const cells = rows.slice(0, 96).reverse()
  return (
    <div className="mt-3 flex h-3 gap-[2px]" aria-hidden>
      {cells.map((r, i) => (
        <span
          key={i}
          title={`${r.ts.toISOString().slice(11, 16)} · ${r[component]}`}
          className={`flex-1 rounded-sm ${
            r[component] === 'ok' ? 'bg-priority-opportunity' : 'bg-priority-critical'
          }`}
        />
      ))}
    </div>
  )
}
