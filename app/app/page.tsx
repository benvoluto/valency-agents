import { and, eq, or, sql } from 'drizzle-orm'
import { requireOnboardedUser } from '@/lib/auth-helpers'
import { db } from '@/db'
import { briefings, follows } from '@/db/schema'
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

  const [feed, counts, savedCount] = await Promise.all([
    loadFeed(user.id, filter),
    countByPriority(user.id),
    countLibrary(user.id),
  ])

  return (
    <HomeShell
      user={user}
      feed={feed}
      filter={filter}
      total={counts.total}
      byPriority={counts.byPriority}
      savedCount={savedCount}
    />
  )
}

async function countLibrary(userId: string): Promise<number> {
  const [savedRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(briefings)
    .where(
      and(
        eq(briefings.userId, userId),
        or(eq(briefings.status, 'acted'), eq(briefings.status, 'approved')),
      ),
    )
  const [followRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(follows)
    .where(eq(follows.userId, userId))
  return Number(savedRow?.n ?? 0) + Number(followRow?.n ?? 0)
}
