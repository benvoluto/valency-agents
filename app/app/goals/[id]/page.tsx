import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight } from '@phosphor-icons/react/dist/ssr'
import { and, desc, eq } from 'drizzle-orm'
import { requireOnboardedUser } from '@/lib/auth-helpers'
import { db } from '@/db'
import { agentRuns, goals, goalSeeds } from '@/db/schema'
import { runGoalPreview } from '@/lib/pipeline/preview'
import { sendEvent } from '@/lib/inngest/client'
import { nextRunAt } from '@/lib/cadence'

const ORCID_RE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dXx]$/

function formatNextRun(d: Date): string {
  return d.toISOString().slice(0, 16).replace('T', ' ') + 'Z'
}

async function updateGoal(formData: FormData) {
  'use server'
  const user = await requireOnboardedUser()
  const id = formData.get('id')?.toString()
  if (!id) return
  const title = formData.get('title')?.toString().trim() ?? ''
  const description = formData.get('description')?.toString().trim() || null
  const cadence = (formData.get('cadence')?.toString() ?? 'weekly') as
    | 'continuous'
    | 'daily'
    | 'weekly'
    | 'on_demand'
  const status = (formData.get('status')?.toString() ?? 'active') as
    | 'active'
    | 'paused'
    | 'archived'

  if (title.length < 3) {
    redirect(
      `/app/goals/${id}?error=${encodeURIComponent('Title must be at least 3 characters.')}`,
    )
  }

  await db
    .update(goals)
    .set({ title, description, cadence, status })
    .where(and(eq(goals.id, id), eq(goals.userId, user.id)))

  await sendEvent({
    name: 'goal.run.requested',
    data: { userId: user.id, goalId: id, reason: 'goal_updated' },
  }).catch(() => {})

  redirect(`/app/goals/${id}?saved=1`)
}

async function addSeed(formData: FormData) {
  'use server'
  const user = await requireOnboardedUser()
  const goalId = formData.get('goalId')?.toString()
  const kind = formData.get('kind')?.toString() as
    | 'category'
    | 'keyword'
    | 'author_orcid'
    | 'paper_id'
    | 'venue'
  const value = formData.get('value')?.toString().trim()
  if (!goalId || !kind || !value) return

  // Confirm the goal belongs to this user.
  const [owned] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, user.id)))
    .limit(1)
  if (!owned) return

  if (kind === 'author_orcid' && !ORCID_RE.test(value)) {
    redirect(
      `/app/goals/${goalId}?error=${encodeURIComponent('ORCID must look like 0000-0000-0000-0000.')}`,
    )
  }

  await db.insert(goalSeeds).values({ goalId, kind, value })
  redirect(`/app/goals/${goalId}?saved=1`)
}

async function removeSeed(formData: FormData) {
  'use server'
  const user = await requireOnboardedUser()
  const seedId = formData.get('seedId')?.toString()
  const goalId = formData.get('goalId')?.toString()
  if (!seedId || !goalId) return

  const [owned] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, user.id)))
    .limit(1)
  if (!owned) return

  await db.delete(goalSeeds).where(eq(goalSeeds.id, seedId))
  redirect(`/app/goals/${goalId}?saved=1`)
}

async function previewGoal(formData: FormData) {
  'use server'
  const user = await requireOnboardedUser()
  const id = formData.get('id')?.toString()
  if (!id) return

  const [goal] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, user.id)))
    .limit(1)
  if (!goal) return

  const { run } = await runGoalPreview(user.id, goal)
  redirect(`/app/runs/${run.id}`)
}

async function deleteGoal(formData: FormData) {
  'use server'
  const user = await requireOnboardedUser()
  const id = formData.get('id')?.toString()
  if (!id) return
  await db
    .delete(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, user.id)))
  redirect('/app/goals')
}

export default async function GoalDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  const user = await requireOnboardedUser()
  const { id } = await params
  const { saved, error } = await searchParams

  const [goal] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, user.id)))
    .limit(1)
  if (!goal) notFound()

  const seeds = await db
    .select()
    .from(goalSeeds)
    .where(eq(goalSeeds.goalId, id))

  const recentRuns = await db
    .select({
      id: agentRuns.id,
      agent: agentRuns.agent,
      status: agentRuns.status,
      startedAt: agentRuns.startedAt,
      finishedAt: agentRuns.finishedAt,
      summaryJson: agentRuns.summaryJson,
    })
    .from(agentRuns)
    .where(eq(agentRuns.goalId, id))
    .orderBy(desc(agentRuns.startedAt))
    .limit(5)

  const next = nextRunAt(goal, user, new Date())

  return (
    <>
      <header className="mb-8">
        <Link
          href="/app/goals"
          className="text-ink-muted font-mono text-xs tracking-wider uppercase hover:underline inline-flex items-center gap-1"
        >
          <ArrowLeft size={12} weight="regular" aria-hidden />
          all goals
        </Link>
        <h1 className="font-display text-ink mt-2 text-3xl">{goal.title}</h1>
        <div className="text-ink-muted mt-2 flex items-center gap-3 font-mono text-[11px] tracking-wider uppercase">
          <span data-testid="cadence-chip">cadence: {goal.cadence}</span>
          <span aria-hidden>·</span>
          <span data-testid="next-run-chip">
            {next
              ? `next run: ${formatNextRun(next)}`
              : 'next run: on demand'}
          </span>
        </div>
      </header>

      {saved ? (
        <div className="bg-accent-soft text-accent mb-6 rounded-md px-4 py-2 text-sm">
          Saved.
        </div>
      ) : null}
      {error ? (
        <div className="bg-priority-critical/10 text-priority-critical mb-6 rounded-md px-4 py-2 text-sm">
          {error}
        </div>
      ) : null}

      <section className="bg-surface border-border-subtle mb-8 rounded-2xl border p-8">
        <h2 className="font-display text-ink text-lg">Goal details</h2>
        <form action={updateGoal} className="mt-4 space-y-4">
          <input type="hidden" name="id" value={goal.id} />
          <label className="block">
            <span className="text-ink text-sm font-medium">Title</span>
            <input
              name="title"
              type="text"
              required
              minLength={3}
              defaultValue={goal.title}
              className="border-border-subtle bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-2 focus:outline-accent"
            />
          </label>
          <label className="block">
            <span className="text-ink text-sm font-medium">Description</span>
            <textarea
              name="description"
              rows={3}
              defaultValue={goal.description ?? ''}
              className="border-border-subtle bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-2 focus:outline-accent"
            />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-ink text-sm font-medium">Cadence</span>
              <select
                name="cadence"
                defaultValue={goal.cadence}
                className="border-border-subtle bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-2 focus:outline-accent"
              >
                <option value="continuous">Continuous</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="on_demand">On demand</option>
              </select>
            </label>
            <label className="block">
              <span className="text-ink text-sm font-medium">Status</span>
              <select
                name="status"
                defaultValue={goal.status}
                className="border-border-subtle bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-2 focus:outline-accent"
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>
          <button
            type="submit"
            className="bg-ink text-surface hover:bg-ink/90 inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition"
          >
            Save goal
          </button>
        </form>
      </section>

      <section className="bg-surface border-border-subtle mb-8 rounded-2xl border p-8">
        <h2 className="font-display text-ink text-lg">Seeds</h2>
        <p className="text-ink-muted mt-1 text-sm">
          {seeds.length} seed{seeds.length === 1 ? '' : 's'} feeding this goal.
        </p>
        <ul className="mt-4 space-y-2">
          {seeds.map((s) => (
            <li
              key={s.id}
              className="border-border-subtle flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-3">
                <span className="text-ink-muted font-mono text-xs uppercase">
                  {s.kind}
                </span>
                <span className="text-ink">{s.value}</span>
              </div>
              <form action={removeSeed}>
                <input type="hidden" name="seedId" value={s.id} />
                <input type="hidden" name="goalId" value={goal.id} />
                <button
                  type="submit"
                  className="text-ink-muted hover:text-priority-critical text-xs"
                >
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
        <form
          action={addSeed}
          className="border-border-subtle mt-4 flex items-end gap-2 border-t pt-4"
        >
          <input type="hidden" name="goalId" value={goal.id} />
          <label className="block">
            <span className="text-ink text-xs font-medium">Kind</span>
            <select
              name="kind"
              defaultValue="keyword"
              className="border-border-subtle bg-surface text-ink mt-1 block rounded-md border px-2 py-1.5 text-sm focus:outline-2 focus:outline-accent"
            >
              <option value="keyword">keyword</option>
              <option value="category">category</option>
              <option value="author_orcid">author_orcid</option>
              <option value="paper_id">paper_id</option>
              <option value="venue">venue</option>
            </select>
          </label>
          <label className="block flex-1">
            <span className="text-ink text-xs font-medium">Value</span>
            <input
              name="value"
              type="text"
              required
              className="border-border-subtle bg-surface text-ink mt-1 block w-full rounded-md border px-2 py-1.5 text-sm focus:outline-2 focus:outline-accent"
            />
          </label>
          <button
            type="submit"
            className="bg-ink text-surface hover:bg-ink/90 inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition"
          >
            Add seed
          </button>
        </form>
      </section>

      <section className="bg-surface border-border-subtle mb-8 rounded-2xl border p-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="font-display text-ink text-lg">Preview</h2>
            <p className="text-ink-muted mt-1 text-sm leading-relaxed">
              Run the deterministic Scout-shaped Valency queries for every seed
              and inspect the raw candidate list. No LLM in the loop — this
              shows what the agents will actually be reasoning over.
            </p>
          </div>
          <form action={previewGoal}>
            <input type="hidden" name="id" value={goal.id} />
            <button
              type="submit"
              className="bg-accent text-surface hover:bg-accent/90 inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition"
            >
              Preview goal
            </button>
          </form>
        </div>
        {recentRuns.length > 0 ? (
          <ul className="border-border-subtle mt-6 divide-y border-t">
            {recentRuns.map((r) => {
              const summary = r.summaryJson as
                | { candidateCount?: number }
                | null
              const candidateCount = summary?.candidateCount ?? 0
              return (
                <li key={r.id} className="flex items-center justify-between py-3 text-sm">
                  <div className="flex items-center gap-4">
                    <span className="text-ink-muted font-mono text-xs uppercase">
                      {r.agent}
                    </span>
                    <span
                      className={
                        r.status === 'completed'
                          ? 'text-priority-opportunity'
                          : r.status === 'running'
                            ? 'text-priority-process'
                            : 'text-priority-critical'
                      }
                    >
                      {r.status}
                    </span>
                    <span className="text-ink">
                      {candidateCount} candidate{candidateCount === 1 ? '' : 's'}
                    </span>
                    <span className="text-ink-muted font-mono text-xs">
                      {r.startedAt.toISOString().slice(0, 16).replace('T', ' ')}
                    </span>
                  </div>
                  <Link
                    href={`/app/runs/${r.id}`}
                    className="text-accent text-sm hover:underline inline-flex items-center gap-1"
                  >
                    Open
                    <ArrowRight size={12} weight="regular" aria-hidden />
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : null}
      </section>

      <section className="border-priority-critical/40 rounded-2xl border p-8">
        <h2 className="font-display text-priority-critical text-lg">
          Danger zone
        </h2>
        <p className="text-ink-muted mt-1 text-sm">
          Deleting a goal removes its seeds. Briefings already produced for the
          goal stay in your library.
        </p>
        <form action={deleteGoal} className="mt-4">
          <input type="hidden" name="id" value={goal.id} />
          <button
            type="submit"
            className="border-priority-critical text-priority-critical hover:bg-priority-critical hover:text-surface inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium transition"
          >
            Delete goal
          </button>
        </form>
      </section>
    </>
  )
}
