import { redirect } from 'next/navigation'
import { and, eq, isNull } from 'drizzle-orm'
import { requireUser } from '@/lib/auth-helpers'
import { db } from '@/db'
import { goalCadence, goals, users } from '@/db/schema'
import { StepIndicator } from '../_components/step-indicator'

type Cadence = (typeof goalCadence.enumValues)[number]

const CADENCE_OPTIONS: { value: Cadence; label: string; hint: string }[] = [
  {
    value: 'continuous',
    label: 'Continuous',
    hint: 'Polled every 15 min — agents will surface anything new immediately.',
  },
  {
    value: 'daily',
    label: 'Daily',
    hint: 'One briefing each morning at 06:00 in your timezone.',
  },
  {
    value: 'weekly',
    label: 'Weekly',
    hint: 'Monday morning roundup — recommended for most goals.',
  },
  {
    value: 'on_demand',
    label: 'On demand',
    hint: 'Only when you click "run now" on the goal.',
  },
]

async function submitCadence(formData: FormData) {
  'use server'
  const user = await requireUser()
  const cadence = formData.get('cadence')?.toString() as Cadence | undefined
  if (!cadence || !CADENCE_OPTIONS.some((o) => o.value === cadence)) {
    redirect('/onboarding/cadence')
  }

  await db.transaction(async (tx) => {
    // Apply to every goal the user created during onboarding (no briefings yet).
    await tx
      .update(goals)
      .set({ cadence })
      .where(eq(goals.userId, user.id))
    await tx
      .update(users)
      .set({ onboardingCompletedAt: new Date() })
      .where(eq(users.id, user.id))
  })

  redirect('/app')
}

export default async function CadenceStep() {
  const user = await requireUser()

  const userGoals = await db
    .select({
      id: goals.id,
      title: goals.title,
    })
    .from(goals)
    .where(eq(goals.userId, user.id))

  if (userGoals.length === 0) {
    redirect('/onboarding/summary')
  }

  // Detect any not-yet-briefed goals — the typical onboarding case.
  const fresh = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.userId, user.id), isNull(goals.lastBriefedAt)))

  return (
    <>
      <StepIndicator active="cadence" />
      <section className="bg-surface border-border-subtle rounded-2xl border p-8">
        <h2 className="font-display text-ink text-xl">
          How often should we check?
        </h2>
        <p className="text-ink-muted mt-2 text-sm leading-relaxed">
          Cadence will be applied to all {fresh.length || userGoals.length} of
          your goals. You can change it per-goal later.
        </p>

        <ul className="mt-4 space-y-1 text-xs">
          {userGoals.map((g) => (
            <li key={g.id} className="text-ink-muted">
              · {g.title}
            </li>
          ))}
        </ul>

        <form action={submitCadence} className="mt-6 space-y-3">
          {CADENCE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="border-border-subtle hover:bg-accent-soft flex cursor-pointer items-start gap-3 rounded-lg border p-4"
            >
              <input
                type="radio"
                name="cadence"
                value={opt.value}
                defaultChecked={opt.value === 'weekly'}
                required
                className="accent-accent mt-1"
              />
              <div>
                <div className="text-ink text-sm font-medium">{opt.label}</div>
                <div className="text-ink-muted mt-0.5 text-xs leading-relaxed">
                  {opt.hint}
                </div>
              </div>
            </label>
          ))}

          <button
            type="submit"
            className="bg-ink text-surface hover:bg-ink/90 mt-2 inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition"
          >
            Finish setup
          </button>
        </form>
      </section>
    </>
  )
}
