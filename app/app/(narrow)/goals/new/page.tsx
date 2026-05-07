import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOnboardedUser } from '@/lib/auth-helpers'
import { db } from '@/db'
import { goals, goalSeeds } from '@/db/schema'
import { sendEvent } from '@/lib/inngest/client'
import { valencyForUser, tools as valency } from '@/lib/valency'

const ORCID_RE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dXx]$/

async function createGoal(formData: FormData) {
  'use server'
  const user = await requireOnboardedUser()
  const title = formData.get('title')?.toString().trim() ?? ''
  const description = formData.get('description')?.toString().trim() || null
  const cadence = (formData.get('cadence')?.toString() ?? 'weekly') as
    | 'continuous'
    | 'daily'
    | 'weekly'
    | 'on_demand'
  const keywords = (formData.get('keywords')?.toString() ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const categoriesArr = formData.getAll('category').map((v) => v.toString())
  const orcids = (formData.get('orcids')?.toString() ?? '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => ORCID_RE.test(s))
  const venues = (formData.get('venues')?.toString() ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const paperIds = (formData.get('paperIds')?.toString() ?? '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)

  if (title.length < 3) {
    redirect(
      `/app/goals/new?error=${encodeURIComponent('Title must be at least 3 characters.')}`,
    )
  }

  const totalSeeds =
    keywords.length +
    categoriesArr.length +
    orcids.length +
    venues.length +
    paperIds.length
  if (totalSeeds === 0) {
    redirect(
      `/app/goals/new?error=${encodeURIComponent('Add at least one seed.')}`,
    )
  }

  const goalId = await db.transaction(async (tx) => {
    const [g] = await tx
      .insert(goals)
      .values({ userId: user.id, title, description, cadence })
      .returning({ id: goals.id })
    const seedRows = [
      ...keywords.map((value) => ({ goalId: g.id, kind: 'keyword' as const, value })),
      ...categoriesArr.map((value) => ({ goalId: g.id, kind: 'category' as const, value })),
      ...orcids.map((value) => ({ goalId: g.id, kind: 'author_orcid' as const, value })),
      ...venues.map((value) => ({ goalId: g.id, kind: 'venue' as const, value })),
      ...paperIds.map((value) => ({ goalId: g.id, kind: 'paper_id' as const, value })),
    ]
    if (seedRows.length > 0) {
      await tx.insert(goalSeeds).values(seedRows)
    }
    return g.id
  })

  // Fire-and-forget: schedule the first pipeline run for this goal. Log
  // outcome so we can see in Vercel logs whether Inngest accepted it.
  try {
    const r = await sendEvent({
      name: 'goal.run.requested',
      data: { userId: user.id, goalId, reason: 'goal_created' },
    })
    console.info(
      JSON.stringify({
        tag: 'inngest.send',
        event: 'goal.run.requested',
        ids: r.ids,
        goalId,
        eventKeySet: !!process.env.INNGEST_EVENT_KEY,
      }),
    )
  } catch (err) {
    console.error(
      JSON.stringify({
        tag: 'inngest.send.failed',
        event: 'goal.run.requested',
        goalId,
        eventKeySet: !!process.env.INNGEST_EVENT_KEY,
        error: err instanceof Error ? err.message : String(err),
      }),
    )
  }

  redirect(`/app/goals/${goalId}`)
}

export default async function NewGoalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const user = await requireOnboardedUser()
  const { error } = await searchParams

  let categories: { category: string; paper_count: number }[] = []
  try {
    const client = await valencyForUser(user.id)
    const domains = await valency.identifyResearchDomains(client, {
      source: 'arxiv',
      limit: 24,
    })
    categories = domains.categories
  } catch {
    // continue without categories
  }

  return (
    <>
      <header className="mb-8">
        <p className="text-ink-muted font-mono text-xs tracking-wider uppercase">
          goals · new
        </p>
        <h1 className="font-display text-ink mt-1 text-3xl">
          Create a goal.
        </h1>
      </header>

      <section className="bg-surface border-border-subtle rounded-2xl border p-8">
        <form action={createGoal} className="space-y-5">
          <label className="block">
            <span className="text-ink text-sm font-medium">Title</span>
            <input
              name="title"
              type="text"
              required
              minLength={3}
              maxLength={120}
              className="border-border-subtle bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-2 focus:outline-accent"
            />
          </label>

          <label className="block">
            <span className="text-ink text-sm font-medium">
              Description{' '}
              <span className="text-ink-muted font-normal">(optional)</span>
            </span>
            <textarea
              name="description"
              rows={3}
              className="border-border-subtle bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-2 focus:outline-accent"
            />
          </label>

          <label className="block">
            <span className="text-ink text-sm font-medium">Cadence</span>
            <select
              name="cadence"
              defaultValue="weekly"
              className="border-border-subtle bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-2 focus:outline-accent"
            >
              <option value="continuous">Continuous (every 15 min)</option>
              <option value="daily">Daily (06:00 local)</option>
              <option value="weekly">Weekly (Mon 06:00 local)</option>
              <option value="on_demand">On demand</option>
            </select>
          </label>

          <label className="block">
            <span className="text-ink text-sm font-medium">Keywords</span>
            <span className="text-ink-muted ml-2 text-xs">comma separated</span>
            <input
              name="keywords"
              type="text"
              className="border-border-subtle bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-2 focus:outline-accent"
            />
          </label>

          <fieldset>
            <legend className="text-ink text-sm font-medium">Categories</legend>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {categories.map((c) => (
                <label
                  key={c.category}
                  className="border-border-subtle hover:bg-accent-soft flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    name="category"
                    value={c.category}
                    className="accent-accent"
                  />
                  <span className="font-mono text-xs">{c.category}</span>
                </label>
              ))}
              {categories.length === 0 ? (
                <p className="text-ink-muted col-span-full text-xs italic">
                  Categories unavailable.
                </p>
              ) : null}
            </div>
          </fieldset>

          <label className="block">
            <span className="text-ink text-sm font-medium">Author ORCIDs</span>
            <span className="text-ink-muted ml-2 text-xs">one per line</span>
            <textarea
              name="orcids"
              rows={2}
              className="border-border-subtle bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 font-mono text-xs focus:outline-2 focus:outline-accent"
            />
          </label>

          <label className="block">
            <span className="text-ink text-sm font-medium">Venues</span>
            <span className="text-ink-muted ml-2 text-xs">comma separated</span>
            <input
              name="venues"
              type="text"
              placeholder="NeurIPS, ICML, ICLR"
              className="border-border-subtle bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-2 focus:outline-accent"
            />
          </label>

          <label className="block">
            <span className="text-ink text-sm font-medium">Paper IDs</span>
            <span className="text-ink-muted ml-2 text-xs">arXiv-style, comma separated</span>
            <input
              name="paperIds"
              type="text"
              placeholder="2406.12345, 2501.06789"
              className="border-border-subtle bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 font-mono text-xs focus:outline-2 focus:outline-accent"
            />
          </label>

          {error ? (
            <p className="text-priority-critical text-sm">{error}</p>
          ) : null}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="bg-ink text-surface hover:bg-ink/90 inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition"
            >
              Create goal
            </button>
            <Link
              href="/app/goals"
              className="text-ink-muted hover:text-ink text-sm"
            >
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </>
  )
}
