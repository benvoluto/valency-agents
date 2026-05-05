import { requireOnboardedUser } from '@/lib/auth-helpers'
import { HomeShell } from '@/components/surface/HomeShell'
import { countByPriority, loadFeed } from '@/components/surface/load-briefings'
import {
  PRIORITY_FILTERS,
  type PriorityFilter,
} from '@/components/surface/types'

const FILTER_KEYS = new Set(PRIORITY_FILTERS.map((f) => f.key))

export default async function AppHome({
  searchParams,
}: {
  searchParams: Promise<{ priority?: string }>
}) {
  const user = await requireOnboardedUser()
  const params = await searchParams
  const filter: PriorityFilter = FILTER_KEYS.has(
    params.priority as PriorityFilter,
  )
    ? (params.priority as PriorityFilter)
    : 'all'

  const [feed, counts] = await Promise.all([
    loadFeed(user.id, filter),
    countByPriority(user.id),
  ])

  return (
    <HomeShell
      user={user}
      feed={feed}
      filter={filter}
      total={counts.total}
      byPriority={counts.byPriority}
      thisWeek={counts.thisWeek}
    />
  )
}
