import {
  ArrowsLeftRight,
  ArrowUUpLeft,
  ChartLineUp,
  CurrencyDollar,
  FileText,
  Hexagon,
  Scales,
  UsersThree,
} from '@phosphor-icons/react/dist/ssr'
import type { ComponentType } from 'react'
import type { Briefing } from '@/db/schema'

type IconProps = { size?: number; weight?: 'regular' | 'bold' | 'fill' }

const ICON: Record<Briefing['kind'], ComponentType<IconProps>> = {
  new_paper: FileText,
  citation: ArrowUUpLeft,
  trend: ChartLineUp,
  collaborator: UsersThree,
  counter_evidence: Scales,
  venue: Hexagon,
  method_shift: ArrowsLeftRight,
  funder: CurrencyDollar,
}

const TINT: Record<Briefing['kind'], string> = {
  new_paper: 'bg-accent-soft text-accent',
  citation: 'bg-priority-signal/10 text-priority-signal',
  trend: 'bg-priority-signal/10 text-priority-signal',
  collaborator: 'bg-priority-opportunity/10 text-priority-opportunity',
  counter_evidence: 'bg-priority-critical/10 text-priority-critical',
  venue: 'bg-priority-opportunity/10 text-priority-opportunity',
  method_shift: 'bg-priority-process/10 text-priority-process',
  funder: 'bg-priority-opportunity/10 text-priority-opportunity',
}

export function CategoryIcon({
  kind,
  size = 32,
}: {
  kind: Briefing['kind']
  size?: number
}) {
  const Icon = ICON[kind]
  return (
    <div
      className={`${TINT[kind]} flex shrink-0 items-center justify-center rounded-md`}
      style={{ width: size, height: size }}
      aria-label={`Category: ${kind.replace(/_/g, ' ')}`}
    >
      <Icon size={Math.round(size * 0.55)} weight="regular" />
    </div>
  )
}
