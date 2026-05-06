'use client'
import { useEffect } from 'react'
import { Check, X } from '@phosphor-icons/react'

export function DryRunModal({
  actionLabel,
  summary,
  effects,
  submitting,
  error,
  onCancel,
  onConfirm,
}: {
  actionLabel: string
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
      aria-label={`Confirm ${actionLabel}`}
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
              {summary ?? `${actionLabel}…`}
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
