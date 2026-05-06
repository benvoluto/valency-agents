import { redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { requireUser } from '@/lib/auth-helpers'
import { db } from '@/db'
import { credentials, follows, users } from '@/db/schema'
import { encryptSecret } from '@/lib/crypto'
import { ValencyClient, tools as valency } from '@/lib/valency'

// ORCIDs are 16 digits in 4-4-4-4 form; the final character may be X.
// Accept the bare id or any orcid.org URL pasted from a profile page.
const ORCID_RE = /^(\d{4}-\d{4}-\d{4}-\d{3}[\dX])$/

function normalizeOrcid(raw: string): string | null | 'invalid' {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  const stripped = trimmed
    .replace(/^https?:\/\/(www\.)?orcid\.org\//i, '')
    .toUpperCase()
  return ORCID_RE.test(stripped) ? stripped : 'invalid'
}

async function saveProfile(formData: FormData) {
  'use server'
  const user = await requireUser()
  const name = formData.get('name')?.toString().trim() || null
  const affiliation = formData.get('affiliation')?.toString().trim() || null
  const timezone = formData.get('timezone')?.toString().trim() || null
  const orcidRaw = formData.get('orcid')?.toString() ?? ''
  const orcid = normalizeOrcid(orcidRaw)
  if (orcid === 'invalid') {
    redirect(
      `/app/settings?error=${encodeURIComponent('ORCID must look like 0000-0002-1825-0097.')}`,
    )
  }
  await db
    .update(users)
    .set({ name, affiliation, timezone, orcid })
    .where(eq(users.id, user.id))
  redirect('/app/settings?saved=profile')
}

async function saveEmailPrefs(formData: FormData) {
  'use server'
  const user = await requireUser()
  const cadence = formData.get('cadence')?.toString() ?? 'daily'
  const validCadences = ['instant', 'hourly', 'daily', 'weekly', 'off']
  if (!validCadences.includes(cadence)) {
    redirect('/app/settings?error=' + encodeURIComponent('invalid cadence'))
  }
  const start = formData.get('quietStart')?.toString()
  const end = formData.get('quietEnd')?.toString()
  const quietStart = start && /^\d+$/.test(start) ? Math.min(23, Math.max(0, Number(start))) : null
  const quietEnd = end && /^\d+$/.test(end) ? Math.min(23, Math.max(0, Number(end))) : null
  await db
    .update(users)
    .set({
      emailDigestCadence: cadence,
      emailQuietHoursStart: quietStart,
      emailQuietHoursEnd: quietEnd,
    })
    .where(eq(users.id, user.id))
  redirect('/app/settings?saved=email')
}

async function resumeEmail(formData: FormData) {
  'use server'
  const user = await requireUser()
  void formData
  await db
    .update(users)
    .set({ emailSuppressed: null })
    .where(eq(users.id, user.id))
  redirect('/app/settings?saved=email')
}

async function saveValencyToken(formData: FormData) {
  'use server'
  const user = await requireUser()
  const token = formData.get('token')?.toString().trim() ?? ''
  if (token.length < 8) {
    redirect(
      `/app/settings?error=${encodeURIComponent('Token looks too short — paste the full bearer string from app.valency.io.')}`,
    )
  }

  // Verify with a cheap authenticated call before storing.
  const client = new ValencyClient({ token })
  try {
    await valency.listSources(client)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Token verification failed.'
    redirect(`/app/settings?error=${encodeURIComponent(msg)}`)
  }

  const cipher = await encryptSecret(token)
  const last4 = token.slice(-4)
  const now = new Date()

  await db
    .insert(credentials)
    .values({
      userId: user.id,
      valencyTokenCipher: cipher,
      valencyTokenLast4: last4,
      lastVerifiedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: credentials.userId,
      set: {
        valencyTokenCipher: cipher,
        valencyTokenLast4: last4,
        lastVerifiedAt: now,
        updatedAt: now,
      },
    })

  redirect('/app/settings?saved=token')
}

async function removeFollow(formData: FormData) {
  'use server'
  const user = await requireUser()
  const kind = formData.get('kind')?.toString() as 'author' | 'paper' | 'topic'
  const refId = formData.get('refId')?.toString()
  if (!kind || !refId) return
  await db
    .delete(follows)
    .where(
      and(
        eq(follows.userId, user.id),
        eq(follows.kind, kind),
        eq(follows.refId, refId),
      ),
    )
  redirect('/app/settings?saved=follow')
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  const user = await requireUser()
  const { saved, error } = await searchParams

  const [cred] = await db
    .select({
      last4: credentials.valencyTokenLast4,
      lastVerifiedAt: credentials.lastVerifiedAt,
    })
    .from(credentials)
    .where(eq(credentials.userId, user.id))
    .limit(1)

  const userFollows = await db
    .select()
    .from(follows)
    .where(eq(follows.userId, user.id))

  return (
    <>
      <header className="mb-8">
        <p className="text-ink-muted font-mono text-xs tracking-wider uppercase">
          settings
        </p>
        <h1 className="font-display text-ink mt-1 text-3xl">
          Profile & connections.
        </h1>
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
        <h2 className="font-display text-ink text-lg">Profile</h2>
        <form action={saveProfile} className="mt-4 space-y-4">
          <label className="block">
            <span className="text-ink text-sm font-medium">Name</span>
            <input
              name="name"
              type="text"
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
              className="border-border-subtle bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-2 focus:outline-accent"
            />
          </label>
          <label className="block">
            <span className="text-ink text-sm font-medium">Timezone</span>
            <input
              name="timezone"
              type="text"
              placeholder="America/New_York"
              defaultValue={user.timezone ?? ''}
              className="border-border-subtle bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-2 focus:outline-accent"
            />
          </label>
          <label className="block">
            <span className="text-ink text-sm font-medium">ORCID</span>
            <input
              name="orcid"
              type="text"
              placeholder="0000-0002-1825-0097"
              defaultValue={user.orcid ?? ''}
              pattern="(?:https?:\/\/(?:www\.)?orcid\.org\/)?\d{4}-\d{4}-\d{4}-\d{3}[\dX]"
              className="border-border-subtle bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 font-mono text-sm focus:outline-2 focus:outline-accent"
            />
            <span className="text-ink-muted mt-1 block text-xs">
              Paste the 16-digit id or the orcid.org URL. Leave blank to
              disconnect.
            </span>
          </label>
          <button
            type="submit"
            className="bg-ink text-surface hover:bg-ink/90 inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition"
          >
            Save profile
          </button>
        </form>
      </section>

      <section className="bg-surface border-border-subtle mb-8 rounded-2xl border p-8">
        <h2 className="font-display text-ink text-lg">Email preferences</h2>
        <p className="text-ink-muted mt-1 text-sm leading-relaxed">
          How often briefings land in your inbox. Replying to a digest with{' '}
          <code className="bg-accent-soft text-accent rounded px-1 font-mono text-[11px]">
            approve
          </code>{' '}
          /{' '}
          <code className="bg-accent-soft text-accent rounded px-1 font-mono text-[11px]">
            dismiss
          </code>{' '}
          /{' '}
          <code className="bg-accent-soft text-accent rounded px-1 font-mono text-[11px]">
            more
          </code>{' '}
          plus the briefing&apos;s short id will fire the corresponding action.
        </p>
        {user.emailSuppressed ? (
          <div className="bg-priority-critical/10 text-priority-critical mt-4 flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm">
            <span>
              Email is suppressed (reason: <code>{user.emailSuppressed}</code>).
              Mailgun won&apos;t deliver until you resume.
            </span>
            <form action={resumeEmail}>
              <button
                type="submit"
                className="bg-priority-critical text-surface hover:bg-priority-critical/90 rounded px-3 py-1 text-xs font-medium"
              >
                Resume
              </button>
            </form>
          </div>
        ) : null}
        <form action={saveEmailPrefs} className="mt-4 space-y-4">
          <fieldset>
            <legend className="text-ink text-sm font-medium">
              Digest cadence
            </legend>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(['instant', 'hourly', 'daily', 'weekly', 'off'] as const).map(
                (c) => (
                  <label
                    key={c}
                    className="border-border-subtle hover:bg-accent-soft flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="cadence"
                      value={c}
                      defaultChecked={user.emailDigestCadence === c}
                      className="accent-accent"
                    />
                    <span className="capitalize">{c}</span>
                  </label>
                ),
              )}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-ink text-sm font-medium">
                Quiet hours start{' '}
                <span className="text-ink-muted font-normal">(0–23, UTC)</span>
              </span>
              <input
                name="quietStart"
                type="number"
                min={0}
                max={23}
                defaultValue={user.emailQuietHoursStart ?? ''}
                className="border-border-subtle bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-2 focus:outline-accent"
              />
            </label>
            <label className="block">
              <span className="text-ink text-sm font-medium">
                Quiet hours end
              </span>
              <input
                name="quietEnd"
                type="number"
                min={0}
                max={23}
                defaultValue={user.emailQuietHoursEnd ?? ''}
                className="border-border-subtle bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-2 focus:outline-accent"
              />
            </label>
          </div>
          <button
            type="submit"
            className="bg-ink text-surface hover:bg-ink/90 inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition"
          >
            Save email preferences
          </button>
        </form>
      </section>

      <section className="bg-surface border-border-subtle mb-8 rounded-2xl border p-8">
        <h2 className="font-display text-ink text-lg">Valency token</h2>
        <p className="text-ink-muted mt-1 text-sm leading-relaxed">
          Issued from{' '}
          <a
            href="https://app.valency.io/settings"
            className="text-accent underline"
            target="_blank"
            rel="noreferrer"
          >
            app.valency.io/settings
          </a>
          . Stored encrypted at rest. The agent pipeline calls Valency on your
          behalf using this token.
        </p>
        {cred ? (
          <p className="text-ink-muted mt-4 font-mono text-xs">
            Current: ····{cred.last4} · last verified{' '}
            {cred.lastVerifiedAt
              ? cred.lastVerifiedAt.toISOString().slice(0, 16).replace('T', ' ')
              : '—'}
          </p>
        ) : (
          <p className="text-ink-muted mt-4 text-xs italic">
            No token on file — pipeline will fall back to the system token.
          </p>
        )}
        <form action={saveValencyToken} className="mt-4 space-y-3">
          <label className="block">
            <span className="text-ink text-sm font-medium">
              {cred ? 'Replace token' : 'New token'}
            </span>
            <input
              name="token"
              type="password"
              autoComplete="off"
              required
              minLength={8}
              placeholder="vlnc_…"
              className="border-border-subtle bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 font-mono text-sm focus:outline-2 focus:outline-accent"
            />
          </label>
          <button
            type="submit"
            className="bg-ink text-surface hover:bg-ink/90 inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition"
          >
            Verify & save
          </button>
        </form>
      </section>

      <section className="bg-surface border-border-subtle rounded-2xl border p-8">
        <h2 className="font-display text-ink text-lg">Follows</h2>
        <p className="text-ink-muted mt-1 text-sm">
          Authors, papers, and topics your agents will weight more heavily.
        </p>
        {userFollows.length === 0 ? (
          <p className="text-ink-muted mt-4 text-xs italic">
            No follows yet — co-authors from your ORCID resolve will appear
            here once you complete onboarding.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {userFollows.map((f) => (
              <li
                key={`${f.kind}:${f.refId}`}
                className="border-border-subtle flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <div>
                  <span className="text-ink-muted font-mono text-xs uppercase">
                    {f.kind}
                  </span>{' '}
                  <span className="text-ink">{f.label ?? f.refId}</span>
                </div>
                <form action={removeFollow}>
                  <input type="hidden" name="kind" value={f.kind} />
                  <input type="hidden" name="refId" value={f.refId} />
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
        )}
      </section>
    </>
  )
}
