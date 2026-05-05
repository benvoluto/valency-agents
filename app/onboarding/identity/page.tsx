import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireUser } from '@/lib/auth-helpers'
import { db } from '@/db'
import { authors, follows, users } from '@/db/schema'
import { valencyForUser, tools as valency } from '@/lib/valency'
import { StepIndicator } from '../_components/step-indicator'

const ORCID_RE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dXx]$/

async function submitIdentity(formData: FormData) {
  'use server'
  const user = await requireUser()
  const name = formData.get('name')?.toString().trim() || null
  const affiliation = formData.get('affiliation')?.toString().trim() || null
  const orcid = formData.get('orcid')?.toString().trim() || null

  if (!name || name.length < 2) {
    redirect(
      `/onboarding/identity?error=${encodeURIComponent('Tell us your name so the agents can address you.')}`,
    )
  }

  if (orcid && !ORCID_RE.test(orcid)) {
    redirect(
      `/onboarding/identity?error=${encodeURIComponent('ORCID must look like 0000-0000-0000-0000.')}`,
    )
  }

  let resolvedAffiliation = affiliation
  let resolvedDisplayName = name

  if (orcid) {
    try {
      const client = await valencyForUser(user.id)
      const result = await valency.resolveOrcid(client, { orcid })
      if (result.profile) {
        resolvedDisplayName = result.profile.display_name
        if (!affiliation) {
          resolvedAffiliation =
            result.profile.current_institution?.institution ?? null
        }
        await db
          .insert(authors)
          .values({
            orcid,
            displayName: result.profile.display_name,
            affiliation: resolvedAffiliation,
            hIndex: result.profile.h_index ?? null,
            worksCount: result.profile.works_count ?? null,
            citedByCount: result.profile.cited_by_count ?? null,
            openalexAuthorId: result.profile.openalex_author_id ?? null,
            profileJson: result.profile as unknown as Record<string, unknown>,
          })
          .onConflictDoUpdate({
            target: authors.orcid,
            set: {
              displayName: result.profile.display_name,
              affiliation: resolvedAffiliation,
              hIndex: result.profile.h_index ?? null,
              worksCount: result.profile.works_count ?? null,
              citedByCount: result.profile.cited_by_count ?? null,
              openalexAuthorId: result.profile.openalex_author_id ?? null,
              profileJson: result.profile as unknown as Record<string, unknown>,
              lastResolvedAt: new Date(),
            },
          })

        // Best-effort coauthor seeding.
        try {
          const co = await valency.findCoauthors(client, {
            author: result.profile.display_name,
            limit: 8,
            exclude_mega_collaborations: true,
          })
          if (co.coauthors.length > 0) {
            await db
              .insert(follows)
              .values(
                co.coauthors.map((c) => ({
                  userId: user.id,
                  kind: 'author' as const,
                  refId: `name:${c.coauthor_norm ?? c.coauthor.toLowerCase()}`,
                  label: c.coauthor,
                })),
              )
              .onConflictDoNothing()
          }
        } catch {
          // tolerate transient failures
        }
      }
    } catch {
      // If Valency fails entirely, proceed with what the user typed.
    }
  }

  await db
    .update(users)
    .set({
      name: resolvedDisplayName,
      affiliation: resolvedAffiliation,
      orcid,
    })
    .where(eq(users.id, user.id))

  redirect('/onboarding/summary')
}

export default async function IdentityStep({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const user = await requireUser()
  const { error } = await searchParams

  return (
    <>
      <StepIndicator active="identity" />
      <section className="bg-surface border-border-subtle rounded-2xl border p-8">
        <h2 className="font-display text-ink text-xl">Who are you?</h2>
        <p className="text-ink-muted mt-2 text-sm leading-relaxed">
          We&apos;ll use these to greet you, identify your papers in the corpus,
          and pre-fill the next step. ORCID is the most reliable signal — paste
          it if you have one. If your ORCID is private, leave it blank and
          we&apos;ll fall back to a name search.
        </p>

        <form action={submitIdentity} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-ink text-sm font-medium">Name</span>
            <input
              name="name"
              type="text"
              required
              minLength={2}
              defaultValue={user.name ?? ''}
              className="border-border-subtle bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-2 focus:outline-accent"
            />
          </label>
          <label className="block">
            <span className="text-ink text-sm font-medium">Affiliation</span>
            <input
              name="affiliation"
              type="text"
              defaultValue={user.affiliation ?? ''}
              placeholder="George Mason University"
              className="border-border-subtle bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-2 focus:outline-accent"
            />
          </label>
          <label className="block">
            <span className="text-ink text-sm font-medium">
              ORCID{' '}
              <span className="text-ink-muted font-normal">(optional)</span>
            </span>
            <input
              name="orcid"
              type="text"
              defaultValue={user.orcid ?? ''}
              placeholder="0000-0000-0000-0000"
              pattern="\d{4}-\d{4}-\d{4}-\d{3}[\dXx]"
              className="border-border-subtle bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 font-mono text-sm focus:outline-2 focus:outline-accent"
            />
          </label>

          {error ? (
            <p className="text-priority-critical text-sm">{error}</p>
          ) : null}

          <button
            type="submit"
            className="bg-ink text-surface hover:bg-ink/90 inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition"
          >
            Continue
          </button>
        </form>
      </section>
    </>
  )
}
