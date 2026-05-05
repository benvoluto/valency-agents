import Link from 'next/link'
import { CategoryIcon } from './CategoryIcon'
import { ConfidenceChip } from './ConfidenceChip'
import { PriorityBadge } from './PriorityBadge'
import { BriefingActions } from './BriefingActions'
import type { BriefingWithDetail } from './types'

function ellipsize(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

export function BriefingCard({ data }: { data: BriefingWithDetail }) {
  const { briefing, goalTitle, sources, tags } = data
  const sourceCount = sources.length
  const authorMatch = sources.find((s) => s.kind === 'author')
  const subtitleParts: string[] = []
  if (goalTitle) subtitleParts.push(`From your "${ellipsize(goalTitle, 60)}"`)
  if (sourceCount > 0) {
    subtitleParts.push(
      `${sourceCount} source${sourceCount === 1 ? '' : 's'}${authorMatch ? ` · author you follow` : ''}`,
    )
  }
  return (
    <article className="bg-surface border-border-subtle rounded-2xl border p-5">
      <div className="flex items-start gap-4">
        <CategoryIcon kind={briefing.kind} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <Link
              href={`/app/briefings/${briefing.id}`}
              className="text-ink hover:text-accent block min-w-0 text-base font-medium leading-snug"
            >
              {ellipsize(briefing.title, 90)}
            </Link>
            <div className="flex items-center gap-2 whitespace-nowrap">
              <ConfidenceChip confidence={briefing.confidence} />
              <PriorityBadge priority={briefing.priority} />
            </div>
          </div>

          {subtitleParts.length > 0 ? (
            <p className="text-ink-muted mt-1 text-[13px]">
              {subtitleParts.join(' · ')}
            </p>
          ) : null}

          {tags.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {tags.slice(0, 5).map((t) => (
                <li
                  key={t.id}
                  className="bg-accent-soft text-accent rounded-full px-2 py-0.5 font-mono text-[11px]"
                >
                  {t.label}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-4 flex items-center justify-between gap-3">
            <BriefingActions data={data} />
          </div>
        </div>
      </div>
    </article>
  )
}
