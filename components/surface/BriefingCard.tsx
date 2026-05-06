import Link from 'next/link'
import { BriefingActions } from './BriefingActions'
import { CategoryHeader } from './CategoryHeader'
import type { BriefingWithDetail } from './types'

const CARD_BG: Record<string, string> = {
  critical: 'bg-card-bg-critical',
  process: 'bg-card-bg-process',
  opportunity: 'bg-card-bg-opportunity',
  signal: 'bg-card-bg-signal',
}

const CARD_INK: Record<string, string> = {
  critical: 'text-card-ink-critical',
  process: 'text-card-ink-process',
  opportunity: 'text-card-ink-opportunity',
  signal: 'text-card-ink-signal',
}

function ellipsize(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

export function BriefingCard({ data }: { data: BriefingWithDetail }) {
  const { briefing } = data
  const bgClass = CARD_BG[briefing.priority]
  const inkClass = CARD_INK[briefing.priority]

  return (
    <article
      className={`${bgClass} relative rounded-2xl p-5`}
      data-priority={briefing.priority}
    >
      <div className={inkClass}>
        <CategoryHeader kind={briefing.kind} priority={briefing.priority} />
      </div>

      <Link
        href={`/app/briefings/${briefing.id}`}
        className="text-ink hover:text-accent focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 mt-3 block rounded-sm"
      >
        <h2 className="font-display text-ink text-xl leading-snug font-medium">
          {ellipsize(briefing.title, 110)}
        </h2>
      </Link>

      <p className="text-ink/85 mt-2 line-clamp-3 text-sm leading-relaxed">
        {briefing.summary}
      </p>

      <div className="mt-4">
        <BriefingActions data={data} />
      </div>
    </article>
  )
}
