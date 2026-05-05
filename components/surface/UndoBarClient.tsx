'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowCounterClockwise, X } from '@phosphor-icons/react'

export function UndoBarClient({
  briefingId,
  summary,
  createdAtIso,
}: {
  briefingId: string
  summary: string
  createdAtIso: string
}) {
  const router = useRouter()
  const [dismissed, setDismissed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (dismissed) return null

  async function undo() {
    setError(null)
    try {
      const res = await fetch(`/api/briefings/${briefingId}/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'undo',
          idempotencyKey: crypto.randomUUID(),
          source: 'web',
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? `request failed (${res.status})`)
        return
      }
      startTransition(() => {
        setDismissed(true)
        router.refresh()
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const elapsed = formatElapsed(createdAtIso)

  return (
    <div
      data-testid="undo-bar"
      className="fixed inset-x-0 bottom-4 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-full border border-border-subtle bg-ink text-surface px-4 py-2 shadow-lg"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{summary}</p>
        {error ? (
          <p className="text-priority-critical mt-0.5 truncate text-[11px]">
            {error}
          </p>
        ) : (
          <p className="text-surface/60 truncate font-mono text-[10px]">
            {elapsed}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={undo}
        disabled={pending}
        className="text-surface hover:text-accent-soft focus-visible:outline-2 focus-visible:outline-accent-soft focus-visible:outline-offset-2 inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-xs font-medium disabled:opacity-50"
      >
        <ArrowCounterClockwise size={14} weight="regular" aria-hidden />
        Undo
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-surface/70 hover:text-surface focus-visible:outline-2 focus-visible:outline-accent-soft focus-visible:outline-offset-2 inline-flex h-11 w-11 items-center justify-center rounded-md"
        aria-label="Dismiss undo bar"
      >
        <X size={14} weight="bold" aria-hidden />
      </button>
    </div>
  )
}

function formatElapsed(iso: string): string {
  const d = new Date(iso)
  const ms = Date.now() - d.getTime()
  const min = Math.round(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.round(min / 60)
  return `${h}h ago`
}
