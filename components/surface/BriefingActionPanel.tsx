'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, BookmarkSimple, Sparkle, FileArrowDown } from '@phosphor-icons/react'
import type { Briefing } from '@/db/schema'

type ActionKind = 'approve' | 'dismiss' | 'save' | 'more_like_this'

const KIND_CTA: Record<Briefing['kind'], { kind: ActionKind; label: string; icon: typeof Check }> = {
  new_paper: { kind: 'save', label: 'Save to library', icon: BookmarkSimple },
  citation: { kind: 'save', label: 'Save citation', icon: FileArrowDown },
  trend: { kind: 'save', label: 'Pin trend', icon: BookmarkSimple },
  collaborator: { kind: 'save', label: 'Save profile', icon: BookmarkSimple },
  counter_evidence: { kind: 'save', label: 'Save for draft', icon: BookmarkSimple },
  venue: { kind: 'save', label: 'Watch venue', icon: BookmarkSimple },
  method_shift: { kind: 'save', label: 'Pin method', icon: BookmarkSimple },
  funder: { kind: 'save', label: 'Save call', icon: BookmarkSimple },
}

interface DryRun {
  summary: string
  effects: string[]
}

export function BriefingActionPanel({
  briefing,
  variant = 'card',
}: {
  briefing: Briefing
  variant?: 'card' | 'detail'
}) {
  const router = useRouter()
  const [pending, setPending] = useState<ActionKind | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dryRun, setDryRun] = useState<DryRun | null>(null)

  const cta = KIND_CTA[briefing.kind]
  const PrimaryIcon = cta.icon

  async function openConfirm(kind: ActionKind) {
    setPending(kind)
    setDryRun(null)
    setError(null)
    try {
      const res = await fetch(
        `/api/briefings/${briefing.id}/dry-run?kind=${kind}`,
        { method: 'GET' },
      )
      if (res.ok) {
        const data = (await res.json()) as DryRun
        setDryRun(data)
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? `dry-run failed (${res.status})`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function confirm(kind: ActionKind) {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/briefings/${briefing.id}/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind,
          idempotencyKey: crypto.randomUUID(),
          source: 'web',
        }),
      })
      const data = (await res.json()) as {
        ok?: boolean
        error?: string
        derivedGoalId?: string
      }
      if (!res.ok || !data.ok) {
        setError(data.error ?? `request failed (${res.status})`)
        setSubmitting(false)
        return
      }
      setPending(null)
      setDryRun(null)
      setSubmitting(false)
      if (kind === 'more_like_this' && data.derivedGoalId) {
        router.push(`/app/goals/${data.derivedGoalId}`)
        return
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  const isCard = variant === 'card'
  const isActed = briefing.status === 'acted' || briefing.status === 'approved'
  const isDismissed = briefing.status === 'dismissed'

  return (
    <>
      <div
        className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${isCard ? 'sm:ml-auto' : ''}`}
        data-testid="briefing-actions"
      >
        {isDismissed ? (
          <span className="text-ink-muted text-xs italic">dismissed</span>
        ) : null}
        {isActed ? (
          <span className="text-priority-opportunity text-xs">{briefing.status}</span>
        ) : null}

        <button
          type="button"
          disabled={submitting || isDismissed || isActed}
          onClick={() => openConfirm('dismiss')}
          className="text-ink-muted hover:text-ink disabled:opacity-40 disabled:hover:text-ink-muted focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 inline-flex min-h-11 items-center rounded px-2 text-xs underline-offset-2 hover:underline"
        >
          Dismiss
        </button>

        {!isCard ? (
          <button
            type="button"
            disabled={submitting || isDismissed}
            onClick={() => openConfirm('approve')}
            className="text-ink-muted hover:text-ink disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 inline-flex min-h-11 items-center rounded px-2 text-xs underline-offset-2 hover:underline"
          >
            Approve
          </button>
        ) : null}

        <button
          type="button"
          disabled={submitting || isDismissed}
          onClick={() => openConfirm('more_like_this')}
          className="text-ink-muted hover:text-ink disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 inline-flex min-h-11 items-center gap-1 rounded px-2 text-xs underline-offset-2 hover:underline"
        >
          <Sparkle size={12} weight="regular" aria-hidden />
          More like this
        </button>

        <button
          type="button"
          disabled={submitting || isDismissed || isActed}
          onClick={() => openConfirm(cta.kind)}
          className="bg-ink text-surface hover:bg-ink/90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition motion-reduce:transition-none"
        >
          <PrimaryIcon size={14} weight="regular" aria-hidden />
          {cta.label}
        </button>
      </div>

      {pending ? (
        <DryRunModal
          actionKind={pending}
          summary={dryRun?.summary ?? null}
          effects={dryRun?.effects ?? null}
          submitting={submitting}
          error={error}
          onCancel={() => {
            setPending(null)
            setDryRun(null)
            setError(null)
          }}
          onConfirm={() => confirm(pending)}
        />
      ) : null}
    </>
  )
}

function DryRunModal({
  actionKind,
  summary,
  effects,
  submitting,
  error,
  onCancel,
  onConfirm,
}: {
  actionKind: ActionKind
  summary: string | null
  effects: string[] | null
  submitting: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onCancel])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Confirm ${actionKind}`}
      data-testid="dry-run-modal"
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onCancel}
        className="absolute inset-0 bg-black/30"
      />
      <div className="bg-surface border-border-subtle relative w-full max-w-md rounded-2xl border p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-ink-muted font-mono text-[11px] tracking-wider uppercase">
              Confirm action
            </p>
            <h2 className="font-display text-ink mt-1 text-lg leading-snug">
              {summary ?? `${actionKind.replace(/_/g, ' ')}…`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-ink-muted hover:text-ink"
            aria-label="Close"
          >
            <X size={18} weight="bold" aria-hidden />
          </button>
        </div>

        {effects ? (
          <ul className="space-y-1.5">
            {effects.map((e, i) => (
              <li key={i} className="text-ink flex items-start gap-2 text-sm">
                <Check
                  size={14}
                  weight="bold"
                  aria-hidden
                  className="text-ink-muted mt-1 shrink-0"
                />
                <span>{e}</span>
              </li>
            ))}
          </ul>
        ) : !error ? (
          <p className="text-ink-muted text-sm italic">Computing preview…</p>
        ) : null}

        {error ? (
          <p className="text-priority-critical mt-3 text-sm">{error}</p>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="text-ink-muted hover:text-ink text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="bg-ink text-surface hover:bg-ink/90 disabled:opacity-50 inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition"
          >
            {submitting ? 'Working…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
