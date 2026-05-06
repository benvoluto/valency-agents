'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BellSlash,
  BookmarkSimple,
  ChatCircle,
  Eye,
  FileArrowDown,
  Paperclip,
  X,
  type Icon,
} from '@phosphor-icons/react'
import type { Briefing } from '@/db/schema'
import type { BriefingWithDetail } from './types'
import { ConfidenceChip } from './ConfidenceChip'
import { DryRunModal } from './DryRunModal'

type ActionKind = 'approve' | 'dismiss' | 'save' | 'more_like_this' | 'snooze'

const SOURCE_KIND_LABEL: Record<string, string> = {
  paper: 'Paper',
  author: 'Author',
  query: 'Query',
  tool_call: 'Tool',
  web: 'Web',
}

const KIND_CTA: Record<
  Briefing['kind'],
  { kind: ActionKind; label: string; icon: Icon }
> = {
  new_paper: { kind: 'save', label: 'Save to Library', icon: BookmarkSimple },
  citation: { kind: 'save', label: 'Save Citation', icon: FileArrowDown },
  trend: { kind: 'save', label: 'Pin Trend', icon: BookmarkSimple },
  collaborator: { kind: 'save', label: 'Save Profile', icon: BookmarkSimple },
  counter_evidence: {
    kind: 'save',
    label: 'Save for Draft',
    icon: BookmarkSimple,
  },
  venue: { kind: 'save', label: 'Watch Venue', icon: BookmarkSimple },
  method_shift: { kind: 'save', label: 'Pin Method', icon: BookmarkSimple },
  funder: { kind: 'save', label: 'Save Call', icon: BookmarkSimple },
}

interface DryRun {
  summary: string
  effects: string[]
}

function band(c: number): string {
  if (c >= 0.9) return 'High'
  if (c >= 0.7) return 'Medium'
  return 'Low'
}

export function BriefingActions({ data }: { data: BriefingWithDetail }) {
  const router = useRouter()
  const [pending, setPending] = useState<ActionKind | null>(null)
  const [dryRun, setDryRun] = useState<DryRun | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [popoverOpen, setPopoverOpen] = useState(false)

  const briefing = data.briefing
  const cta = KIND_CTA[briefing.kind]
  const PrimaryIcon = cta.icon
  const isActed = briefing.status === 'acted' || briefing.status === 'approved'
  const isDismissed = briefing.status === 'dismissed'
  const sourceLabels = data.sources
    .slice(0, 4)
    .map((s) => s.refId)
    .join(', ')

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
        const d = (await res.json()) as DryRun
        setDryRun(d)
      } else {
        const d = (await res.json().catch(() => ({}))) as { error?: string }
        setError(d.error ?? `dry-run failed (${res.status})`)
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
      const d = (await res.json()) as {
        ok?: boolean
        error?: string
        derivedGoalId?: string
      }
      if (!res.ok || !d.ok) {
        setError(d.error ?? `request failed (${res.status})`)
        setSubmitting(false)
        return
      }
      setPending(null)
      setDryRun(null)
      setSubmitting(false)
      if (kind === 'more_like_this' && d.derivedGoalId) {
        router.push(`/app/goals/${d.derivedGoalId}`)
        return
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  return (
    <>
      <div
        className="flex flex-wrap items-center gap-2"
        data-testid="briefing-actions"
      >
        <Pill
          icon={PrimaryIcon}
          label={cta.label}
          onClick={() => openConfirm(cta.kind)}
          disabled={submitting || isDismissed || isActed}
        />
        <Pill
          icon={ChatCircle}
          label="Explain"
          onClick={() => setDrawerOpen(true)}
          disabled={submitting}
          ariaHasPopup="dialog"
        />
        <Pill
          icon={BellSlash}
          label="Snooze"
          onClick={() => openConfirm('snooze')}
          disabled={submitting || isDismissed}
        />
        <button
          type="button"
          onClick={() => openConfirm('dismiss')}
          disabled={submitting || isDismissed || isActed}
          aria-label="Dismiss briefing"
          className="bg-surface text-ink-muted hover:text-ink disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 inline-flex h-9 w-9 items-center justify-center rounded-full transition"
        >
          <X size={14} weight="bold" aria-hidden />
        </button>

        {isDismissed ? (
          <span className="text-ink-muted text-xs italic">dismissed</span>
        ) : null}
        {isActed ? (
          <span className="text-priority-opportunity text-xs">
            {briefing.status}
          </span>
        ) : null}
      </div>

      {sourceLabels ? (
        <p className="text-ink-muted/80 mt-3 flex items-center gap-1.5 text-xs">
          <Paperclip size={14} weight="regular" aria-hidden />
          <span className="truncate">{sourceLabels}</span>
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setPopoverOpen((v) => !v)}
        aria-expanded={popoverOpen}
        className="text-ink-muted/80 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 mt-1.5 inline-flex items-center gap-1.5 rounded text-xs"
      >
        <Eye size={14} weight="regular" aria-hidden />
        Show sources
      </button>

      {popoverOpen ? (
        <SourcesPopover data={data} onClose={() => setPopoverOpen(false)} />
      ) : null}
      {drawerOpen ? (
        <ExplainDrawer data={data} onClose={() => setDrawerOpen(false)} />
      ) : null}
      {pending ? (
        <DryRunModal
          actionLabel={pending.replace(/_/g, ' ')}
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

function Pill({
  icon: IconComp,
  label,
  onClick,
  disabled,
  ariaHasPopup,
}: {
  icon: Icon
  label: string
  onClick: () => void
  disabled?: boolean
  ariaHasPopup?: 'dialog' | 'menu'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-haspopup={ariaHasPopup}
      className="bg-surface text-accent hover:bg-surface/80 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition"
    >
      <IconComp size={14} weight="regular" aria-hidden />
      {label}
    </button>
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
      <div className="bg-surface border-border-subtle relative flex h-full w-full flex-col overflow-y-auto border-l p-6 shadow-2xl sm:max-w-md">
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
              {band(briefing.confidence)} ·{' '}
              {Math.round(briefing.confidence * 100)}% — see sources for the
              calibration.
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
