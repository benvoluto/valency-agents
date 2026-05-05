'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { X } from '@phosphor-icons/react'
import type { BriefingWithDetail } from './types'
import { ConfidenceChip } from './ConfidenceChip'
import { BriefingActionPanel } from './BriefingActionPanel'

const SOURCE_KIND_LABEL: Record<string, string> = {
  paper: 'Paper',
  author: 'Author',
  query: 'Query',
  tool_call: 'Tool',
  web: 'Web',
}

function band(c: number): string {
  if (c >= 0.9) return 'High'
  if (c >= 0.7) return 'Medium'
  return 'Low'
}

export function BriefingActions({
  data,
}: {
  data: BriefingWithDetail
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [popoverOpen, setPopoverOpen] = useState(false)
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 inline-flex min-h-11 items-center rounded px-2 underline-offset-2 hover:underline"
          aria-haspopup="dialog"
        >
          Explain
        </button>
        <span className="text-ink-muted hidden sm:inline" aria-hidden>
          ·
        </span>
        <button
          type="button"
          onClick={() => setPopoverOpen((v) => !v)}
          className="text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 inline-flex min-h-11 items-center rounded px-2 underline-offset-2 hover:underline"
          aria-expanded={popoverOpen}
        >
          Show sources
        </button>
      </div>

      <BriefingActionPanel briefing={data.briefing} variant="card" />

      {popoverOpen ? (
        <SourcesPopover data={data} onClose={() => setPopoverOpen(false)} />
      ) : null}
      {drawerOpen ? (
        <ExplainDrawer data={data} onClose={() => setDrawerOpen(false)} />
      ) : null}
    </>
  )
}

function SourcesPopover({
  data,
  onClose,
}: {
  data: BriefingWithDetail
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return
      if (e.target instanceof Node && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [onClose])
  return (
    <div
      ref={ref}
      role="region"
      aria-label="Sources"
      data-testid="sources-popover"
      className="bg-surface border-border-subtle absolute z-10 mt-2 w-full max-w-md rounded-xl border p-4 shadow-lg"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-ink-muted font-mono text-[11px] tracking-wider uppercase">
          What I looked at
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 inline-flex h-9 w-9 items-center justify-center rounded-md"
          aria-label="Close sources"
        >
          <X size={14} weight="bold" aria-hidden />
        </button>
      </div>
      {data.sources.length === 0 ? (
        <p className="text-ink-muted text-xs italic">
          No sources recorded for this briefing.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {data.sources.map((s) => (
            <li key={s.id}>
              <Link
                href={`/app/briefings/${data.briefing.id}#source-${s.id}`}
                data-testid="source-chip"
                className="border-border-subtle hover:bg-accent-soft inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs"
              >
                <span className="text-ink-muted font-mono text-[10px] uppercase">
                  {SOURCE_KIND_LABEL[s.kind] ?? s.kind}
                </span>
                <span className="text-ink font-mono text-[11px]">
                  {s.refId}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ExplainDrawer({
  data,
  onClose,
}: {
  data: BriefingWithDetail
  onClose: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const { briefing, provenance, sources } = data
  return (
    <div
      role="dialog"
      aria-label={`Explain: ${briefing.title}`}
      data-testid="explain-drawer"
      className="fixed inset-0 z-50 flex justify-end"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <div className="bg-surface relative flex h-full w-full flex-col overflow-y-auto border-l border-border-subtle p-6 shadow-2xl sm:max-w-md">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <p className="text-ink-muted font-mono text-[11px] tracking-wider uppercase">
              Explain
            </p>
            <h2 className="font-display text-ink mt-1 text-lg leading-snug">
              {briefing.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 inline-flex h-11 w-11 items-center justify-center rounded-md"
            aria-label="Close drawer"
          >
            <X size={18} weight="bold" aria-hidden />
          </button>
        </div>

        <Section title="Why this surfaced">
          {provenance?.reasoning ? (
            <p className="text-ink text-sm leading-relaxed">
              {provenance.reasoning}
            </p>
          ) : (
            <p className="text-ink-muted text-sm italic">
              No reasoning recorded.
            </p>
          )}
        </Section>

        <Section title="What I looked at">
          {sources.length === 0 ? (
            <p className="text-ink-muted text-sm italic">No sources.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {sources.map((s) => (
                <li
                  key={s.id}
                  className="border-border-subtle bg-bg flex items-center gap-2 rounded-md border px-2 py-1 text-xs"
                >
                  <span className="text-ink-muted font-mono text-[10px] uppercase">
                    {SOURCE_KIND_LABEL[s.kind] ?? s.kind}
                  </span>
                  <span className="text-ink font-mono text-[11px]">
                    {s.refId}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Confidence">
          <div className="flex items-baseline gap-3">
            <ConfidenceChip confidence={briefing.confidence} />
            <span className="text-ink-muted text-xs">
              {band(briefing.confidence)} · {Math.round(briefing.confidence * 100)}% — see sources for the calibration.
            </span>
          </div>
        </Section>

        <Section title="What I will and won't do">
          {provenance?.whatIWillDo ? (
            <p className="text-ink text-sm leading-relaxed">
              {provenance.whatIWillDo}
            </p>
          ) : (
            <p className="text-ink-muted text-sm italic">
              No action plan recorded.
            </p>
          )}
        </Section>
      </div>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="border-border-subtle border-b py-4 first:pt-0 last:border-b-0 last:pb-0">
      <h3 className="text-ink-muted mb-2 font-mono text-[11px] tracking-wider uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}
