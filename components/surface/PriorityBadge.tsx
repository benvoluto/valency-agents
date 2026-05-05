import type { Briefing } from '@/db/schema'

const TINT: Record<Briefing['priority'], string> = {
  critical: 'bg-priority-critical/10 text-priority-critical',
  process: 'bg-priority-process/10 text-priority-process',
  opportunity: 'bg-priority-opportunity/10 text-priority-opportunity',
  signal: 'bg-priority-signal/10 text-priority-signal',
}

const LABEL: Record<Briefing['priority'], string> = {
  critical: 'CRITICAL',
  process: 'IN PROCESS',
  opportunity: 'OPPORTUNITY',
  signal: 'SIGNAL',
}

export function PriorityBadge({
  priority,
}: {
  priority: Briefing['priority']
}) {
  return (
    <span
      className={`${TINT[priority]} inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider`}
    >
      {LABEL[priority]}
    </span>
  )
}
