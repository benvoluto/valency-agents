import {
  ArrowsLeftRight,
  ArrowUUpLeft,
  ChartLineUp,
  CurrencyDollar,
  FileText,
  Hexagon,
  Mailbox,
  Scales,
  UsersThree,
  Warning,
} from '@phosphor-icons/react/dist/ssr'
import type { ComponentType } from 'react'
import type { Briefing } from '@/db/schema'

type IconComp = ComponentType<{
  size?: number
  weight?: 'regular' | 'bold' | 'fill' | 'duotone'
}>

const KIND_ICON: Record<Briefing['kind'], IconComp> = {
  new_paper: FileText,
  citation: ArrowUUpLeft,
  trend: ChartLineUp,
  collaborator: UsersThree,
  counter_evidence: Scales,
  venue: Hexagon,
  method_shift: ArrowsLeftRight,
  funder: CurrencyDollar,
}

const KIND_LABEL: Record<Briefing['kind'], string> = {
  new_paper: 'New Paper',
  citation: 'Citation',
  trend: 'Trend',
  collaborator: 'Collaborator',
  counter_evidence: 'Counter-Evidence',
  venue: 'Venue',
  method_shift: 'Method Shift',
  funder: 'Funder',
}

const PRIORITY_LABEL: Record<Briefing['priority'], string> = {
  critical: 'High Priority',
  process: 'In Process',
  opportunity: 'Opportunity',
  signal: 'Signal',
}

const PRIORITY_ICON: Record<
  Exclude<Briefing['priority'], 'signal'>,
  IconComp
> = {
  critical: Warning,
  process: ChartLineUp,
  opportunity: Mailbox,
}

/**
 * For a card header: shows priority text for critical/process/opportunity,
 * and the kind text for signal-priority cards (since "Signal" alone is
 * uninformative — "Method Shift", "Trend" etc. are more useful).
 */
export function CategoryHeader({
  kind,
  priority,
}: {
  kind: Briefing['kind']
  priority: Briefing['priority']
}) {
  const useKind = priority === 'signal'
  const label = useKind ? KIND_LABEL[kind] : PRIORITY_LABEL[priority]
  const Icon = useKind ? KIND_ICON[kind] : PRIORITY_ICON[priority]
  return (
    <div className="flex items-center gap-1.5 text-sm font-medium">
      <Icon size={18} weight="regular" aria-hidden />
      <span>{label}</span>
    </div>
  )
}
