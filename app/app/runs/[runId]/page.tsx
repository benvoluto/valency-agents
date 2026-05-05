import { notFound } from 'next/navigation'
import Link from 'next/link'
import { and, asc, eq } from 'drizzle-orm'
import { requireOnboardedUser } from '@/lib/auth-helpers'
import { db } from '@/db'
import { agentRuns, agentSteps, goals } from '@/db/schema'

type Props = { params: Promise<{ runId: string }> }

interface SummaryShape {
  candidateCount?: number
  papersBySeed?: Record<string, number>
  warnings?: string[]
}

interface PaperLike {
  id: string
  title: string
  abstract?: string | null
  url?: string | null
  source?: string
  datestamp?: string | null
}

function extractPapers(response: unknown): PaperLike[] {
  if (!response || typeof response !== 'object') return []
  const r = response as Record<string, unknown>
  const list =
    (r.papers as unknown) ??
    (r.papers_in_corpus as unknown) ??
    null
  if (!Array.isArray(list)) return []
  return list.filter(
    (x): x is PaperLike =>
      typeof x === 'object' && x !== null && 'id' in x && 'title' in x,
  )
}

function aggregatePapers(
  steps: { responseJson: unknown }[],
): PaperLike[] {
  const seen = new Set<string>()
  const out: PaperLike[] = []
  for (const s of steps) {
    for (const p of extractPapers(s.responseJson)) {
      if (seen.has(p.id)) continue
      seen.add(p.id)
      out.push(p)
    }
  }
  return out
}

function formatDuration(start: Date, end: Date | null): string {
  const ms = (end ?? new Date()).getTime() - start.getTime()
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export default async function RunInspector({ params }: Props) {
  const user = await requireOnboardedUser()
  const { runId } = await params

  const [run] = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.userId, user.id)))
    .limit(1)
  if (!run) notFound()

  const goal = run.goalId
    ? (
        await db
          .select({ id: goals.id, title: goals.title })
          .from(goals)
          .where(eq(goals.id, run.goalId))
          .limit(1)
      )[0]
    : null

  const steps = await db
    .select()
    .from(agentSteps)
    .where(eq(agentSteps.runId, runId))
    .orderBy(asc(agentSteps.ord))

  const summary = (run.summaryJson ?? null) as SummaryShape | null
  const aggregated = aggregatePapers(steps)
  const totalLatency = steps.reduce((sum, s) => sum + (s.latencyMs ?? 0), 0)

  return (
    <>
      <header className="mb-8">
        <Link
          href={goal ? `/app/goals/${goal.id}` : '/app/goals'}
          className="text-ink-muted font-mono text-xs tracking-wider uppercase hover:underline"
        >
          ← {goal ? goal.title : 'all goals'}
        </Link>
        <h1 className="font-display text-ink mt-2 text-3xl">Run inspector</h1>
        <p className="text-ink-muted mt-1 font-mono text-xs">
          {run.id}
        </p>
      </header>

      <section className="bg-surface border-border-subtle mb-8 rounded-2xl border p-6">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Stat label="Agent" value={run.agent} />
          <Stat
            label="Status"
            value={run.status}
            tone={
              run.status === 'completed'
                ? 'opportunity'
                : run.status === 'running'
                  ? 'process'
                  : 'critical'
            }
          />
          <Stat
            label="Wall time"
            value={formatDuration(run.startedAt, run.finishedAt)}
          />
          <Stat
            label="Tool latency"
            value={`${totalLatency}ms`}
          />
          <Stat label="Steps" value={String(steps.length)} />
          <Stat label="Cost" value={`$${run.costUsd.toFixed(4)}`} />
          <Stat
            label="Tokens in"
            value={String(run.tokensIn)}
          />
          <Stat
            label="Tokens out"
            value={String(run.tokensOut)}
          />
        </div>
        {summary?.warnings && summary.warnings.length > 0 ? (
          <ul className="border-border-subtle mt-6 border-t pt-4 text-xs">
            {summary.warnings.map((w, i) => (
              <li key={i} className="text-priority-signal">
                ⚠ {w}
              </li>
            ))}
          </ul>
        ) : null}
        {run.errorJson ? (
          <pre className="bg-priority-critical/5 text-priority-critical mt-6 overflow-auto rounded-md p-3 font-mono text-xs">
            {JSON.stringify(run.errorJson, null, 2)}
          </pre>
        ) : null}
      </section>

      {aggregated.length > 0 ? (
        <section className="bg-surface border-border-subtle mb-8 rounded-2xl border p-6">
          <header className="mb-4">
            <h2 className="font-display text-ink text-lg">
              Candidates ({aggregated.length})
            </h2>
            <p className="text-ink-muted mt-1 text-sm">
              Aggregated and de-duplicated across every Valency call in the run.
            </p>
          </header>
          <ol className="space-y-3">
            {aggregated.slice(0, 50).map((p, i) => (
              <li
                key={p.id}
                className="border-border-subtle rounded-md border p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-ink-muted font-mono text-xs">
                      #{i + 1} · {p.id}
                      {p.datestamp ? ` · ${p.datestamp}` : ''}
                    </p>
                    <p className="text-ink mt-1 font-medium leading-snug">
                      {p.title}
                    </p>
                    {p.abstract ? (
                      <p className="text-ink-muted mt-2 line-clamp-3 text-sm leading-relaxed">
                        {p.abstract}
                      </p>
                    ) : null}
                  </div>
                  {p.url ? (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent text-xs hover:underline"
                    >
                      open →
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="bg-surface border-border-subtle rounded-2xl border p-6">
        <header className="mb-4">
          <h2 className="font-display text-ink text-lg">
            Step trace ({steps.length})
          </h2>
          <p className="text-ink-muted mt-1 text-sm">
            Every Valency call the run made, in order.
          </p>
        </header>
        <ol className="space-y-3">
          {steps.map((s) => (
            <li
              key={s.id}
              className="border-border-subtle rounded-md border p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-ink-muted font-mono text-xs">
                    {String(s.ord).padStart(2, '0')}
                  </span>
                  <span className="text-ink-muted font-mono text-xs uppercase">
                    {s.kind}
                  </span>
                  <span className="text-ink font-mono text-sm">
                    {s.toolName ?? '—'}
                  </span>
                </div>
                <div className="text-ink-muted flex items-center gap-3 font-mono text-xs">
                  {s.latencyMs !== null ? <span>{s.latencyMs}ms</span> : null}
                  {s.errorMessage ? (
                    <span className="text-priority-critical">error</span>
                  ) : null}
                </div>
              </div>
              <details className="mt-3 text-xs">
                <summary className="text-ink-muted cursor-pointer font-mono">
                  args
                </summary>
                <pre className="bg-bg mt-2 overflow-auto rounded-md p-3 font-mono">
                  {JSON.stringify(s.requestJson, null, 2)}
                </pre>
              </details>
              <details className="mt-2 text-xs">
                <summary className="text-ink-muted cursor-pointer font-mono">
                  response (trimmed)
                </summary>
                <pre className="bg-bg mt-2 max-h-64 overflow-auto rounded-md p-3 font-mono">
                  {trimResponse(s.responseJson)}
                </pre>
              </details>
              {s.errorMessage ? (
                <p className="text-priority-critical mt-2 font-mono text-xs">
                  {s.errorMessage}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}

function trimResponse(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  const json = JSON.stringify(value, null, 2)
  if (json.length <= 4000) return json
  return `${json.slice(0, 4000)}\n… (${json.length - 4000} more bytes)`
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'opportunity' | 'process' | 'critical'
}) {
  const toneClass =
    tone === 'opportunity'
      ? 'text-priority-opportunity'
      : tone === 'process'
        ? 'text-priority-process'
        : tone === 'critical'
          ? 'text-priority-critical'
          : 'text-ink'
  return (
    <div>
      <p className="text-ink-muted font-mono text-xs tracking-wider uppercase">
        {label}
      </p>
      <p className={`mt-1 text-base ${toneClass}`}>{value}</p>
    </div>
  )
}
