import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth-helpers'
import { db } from '@/db'
import { goals, goalSeeds } from '@/db/schema'
import { valencyForUser } from '@/lib/valency'
import { gatherResearcherPapers } from '@/lib/valency/papers'
import {
  analyzeResearcher,
  type ResearchGoalCandidate,
} from '@/lib/agents/analyze-researcher'
import { StepIndicator } from '../_components/step-indicator'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function loadCandidates(user: {
  id: string
  name: string | null
  affiliation: string | null
  orcid: string | null
}): Promise<{ candidates: ResearchGoalCandidate[]; warning?: string }> {
  let papers: Awaited<ReturnType<typeof gatherResearcherPapers>> = []
  try {
    const client = await valencyForUser(user.id)
    papers = await gatherResearcherPapers(client, {
      orcid: user.orcid,
      name: user.name,
      limit: 12,
    })
  } catch (err) {
    return {
      candidates: [],
      warning:
        err instanceof Error
          ? `Couldn't reach Valency: ${err.message}`
          : 'Couldn\'t reach Valency.',
    }
  }
  if (papers.length === 0) {
    return {
      candidates: [],
      warning:
        'No papers found in the corpus for that name/ORCID. You can still add a goal manually below.',
    }
  }
  try {
    const result = await analyzeResearcher({
      name: user.name,
      affiliation: user.affiliation,
      orcid: user.orcid,
      papers: papers.map((p) => ({
        id: p.id,
        title: p.title,
        abstract: p.abstract ?? null,
        categories: p.categories ?? null,
      })),
    })
    return { candidates: result.goals }
  } catch (err) {
    return {
      candidates: [],
      warning:
        err instanceof Error
          ? `Couldn't summarize: ${err.message}`
          : 'Couldn\'t summarize.',
    }
  }
}

async function submitSelected(formData: FormData) {
  'use server'
  const user = await requireUser()
  const indexes = formData
    .getAll('include')
    .map((v) => Number.parseInt(v.toString(), 10))
    .filter((n) => Number.isFinite(n))

  if (indexes.length === 0) {
    redirect(
      `/onboarding/summary?error=${encodeURIComponent('Pick at least one goal to continue.')}`,
    )
  }

  const created: string[] = []
  await db.transaction(async (tx) => {
    for (const i of indexes) {
      const title = formData.get(`title_${i}`)?.toString().trim()
      const description = formData.get(`description_${i}`)?.toString().trim() || null
      const keywords = (formData.get(`keywords_${i}`)?.toString() ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const sources = (formData.get(`sources_${i}`)?.toString() ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      if (!title || title.length < 3) continue

      const [g] = await tx
        .insert(goals)
        .values({
          userId: user.id,
          title,
          description,
          cadence: 'weekly',
        })
        .returning({ id: goals.id })

      const seedRows = [
        ...keywords.map((value) => ({
          goalId: g.id,
          kind: 'keyword' as const,
          value,
        })),
        ...sources.map((value) => ({
          goalId: g.id,
          kind: 'paper_id' as const,
          value,
        })),
      ]
      if (seedRows.length > 0) {
        await tx.insert(goalSeeds).values(seedRows)
      }
      created.push(g.id)
    }
  })

  if (created.length === 0) {
    redirect(
      `/onboarding/summary?error=${encodeURIComponent('No goals were created — please tick at least one and give it a title.')}`,
    )
  }

  redirect('/onboarding/cadence')
}

async function submitManual(formData: FormData) {
  'use server'
  const user = await requireUser()
  const title = formData.get('title')?.toString().trim() ?? ''
  const description = formData.get('description')?.toString().trim() || null
  const keywords = (formData.get('keywords')?.toString() ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (title.length < 3 || keywords.length === 0) {
    redirect(
      `/onboarding/summary?error=${encodeURIComponent('Manual goals need a title and at least one keyword.')}`,
    )
  }

  await db.transaction(async (tx) => {
    const [g] = await tx
      .insert(goals)
      .values({ userId: user.id, title, description, cadence: 'weekly' })
      .returning({ id: goals.id })
    await tx.insert(goalSeeds).values(
      keywords.map((value) => ({
        goalId: g.id,
        kind: 'keyword' as const,
        value,
      })),
    )
  })

  redirect('/onboarding/cadence')
}

export default async function SummaryStep({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const user = await requireUser()
  const { error } = await searchParams

  if (!user.name) {
    redirect('/onboarding/identity')
  }

  const { candidates, warning } = await loadCandidates(user)

  return (
    <>
      <StepIndicator active="summary" />

      {error ? (
        <div className="bg-priority-critical/10 text-priority-critical mb-4 rounded-md px-4 py-2 text-sm">
          {error}
        </div>
      ) : null}

      {candidates.length > 0 ? (
        <section className="bg-surface border-border-subtle rounded-2xl border p-8">
          <h2 className="font-display text-ink text-xl">
            Here&apos;s what we think you&apos;re working on.
          </h2>
          <p className="text-ink-muted mt-2 text-sm leading-relaxed">
            We pulled {candidates.length} research thread
            {candidates.length === 1 ? '' : 's'} from your papers. Tick the
            ones the agents should track. Edit the title or description if
            we&apos;ve framed it wrong.
          </p>

          <form action={submitSelected} className="mt-6 space-y-5">
            {candidates.map((c, i) => (
              <article
                key={i}
                className="border-border-subtle rounded-xl border p-5"
              >
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    name="include"
                    value={String(i)}
                    defaultChecked
                    className="accent-accent mt-2"
                  />
                  <div className="flex-1 space-y-3">
                    <input
                      name={`title_${i}`}
                      defaultValue={c.title}
                      className="border-border-subtle text-ink font-display block w-full rounded-md border px-3 py-2 text-base focus:outline-2 focus:outline-accent"
                      required
                      minLength={3}
                    />
                    <textarea
                      name={`description_${i}`}
                      defaultValue={c.description}
                      rows={3}
                      className="border-border-subtle text-ink-muted block w-full rounded-md border px-3 py-2 text-sm focus:outline-2 focus:outline-accent"
                    />
                    <div className="text-ink-muted flex flex-wrap gap-2 text-xs">
                      {c.keywords.map((k) => (
                        <span
                          key={k}
                          className="bg-accent-soft text-accent rounded-full px-2 py-0.5 font-mono"
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                    <input
                      type="hidden"
                      name={`keywords_${i}`}
                      value={c.keywords.join(',')}
                    />
                    <input
                      type="hidden"
                      name={`sources_${i}`}
                      value={c.source_paper_ids.join(',')}
                    />
                    {c.source_paper_ids.length > 0 ? (
                      <p className="text-ink-muted font-mono text-xs">
                        from {c.source_paper_ids.length} paper
                        {c.source_paper_ids.length === 1 ? '' : 's'}:{' '}
                        {c.source_paper_ids.slice(0, 3).join(', ')}
                        {c.source_paper_ids.length > 3 ? '…' : ''}
                      </p>
                    ) : null}
                  </div>
                </label>
              </article>
            ))}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                className="bg-ink text-surface hover:bg-ink/90 inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition"
              >
                Save selected & continue
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className="bg-surface border-border-subtle rounded-2xl border p-8">
          <h2 className="font-display text-ink text-xl">
            Let&apos;s start with one goal.
          </h2>
          <p className="text-ink-muted mt-2 text-sm leading-relaxed">
            {warning ??
              'We could not auto-summarize from the corpus, so describe the first thread you want tracked.'}
          </p>
          <form action={submitManual} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-ink text-sm font-medium">Title</span>
              <input
                name="title"
                type="text"
                required
                minLength={3}
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
              <span className="text-ink text-sm font-medium">Keywords</span>
              <span className="text-ink-muted ml-2 text-xs">comma separated</span>
              <input
                name="keywords"
                type="text"
                required
                className="border-border-subtle bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-2 focus:outline-accent"
              />
            </label>
            <button
              type="submit"
              className="bg-ink text-surface hover:bg-ink/90 inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition"
            >
              Save goal & continue
            </button>
          </form>
        </section>
      )}
    </>
  )
}
