import type {
  Briefing,
  BriefingProvenance,
  BriefingSource,
  Tag,
} from '@/db/schema'

export interface BriefingWithDetail {
  briefing: Briefing
  sources: BriefingSource[]
  provenance: BriefingProvenance | null
  tags: Tag[]
  goalTitle: string | null
}

export const PRIORITY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical' },
  { key: 'process', label: 'In Process' },
  { key: 'opportunity', label: 'Opportunities' },
  { key: 'signal', label: 'Signals' },
] as const

export type PriorityFilter = (typeof PRIORITY_FILTERS)[number]['key']
