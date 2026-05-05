import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  briefingProvenance,
  briefingSources,
  briefingTags,
  briefings,
  goals,
  tags,
  type Briefing,
} from '@/db/schema'
import type { BriefingWithDetail, PriorityFilter } from './types'

export async function loadFeed(
  userId: string,
  filter: PriorityFilter,
): Promise<BriefingWithDetail[]> {
  const where =
    filter === 'all'
      ? eq(briefings.userId, userId)
      : and(eq(briefings.userId, userId), eq(briefings.priority, filter))

  const rows = await db
    .select({
      briefing: briefings,
      goalTitle: goals.title,
    })
    .from(briefings)
    .leftJoin(goals, eq(goals.id, briefings.goalId))
    .where(where)
    .orderBy(desc(briefings.createdAt))
    .limit(50)

  if (rows.length === 0) return []

  const ids = rows.map((r) => r.briefing.id)

  const [provs, allSources, tagLinks] = await Promise.all([
    db
      .select()
      .from(briefingProvenance)
      .where(inArray(briefingProvenance.briefingId, ids)),
    db
      .select()
      .from(briefingSources)
      .where(inArray(briefingSources.briefingId, ids)),
    db
      .select({
        briefingId: briefingTags.briefingId,
        tag: tags,
      })
      .from(briefingTags)
      .innerJoin(tags, eq(tags.id, briefingTags.tagId))
      .where(inArray(briefingTags.briefingId, ids)),
  ])

  const provByBriefing = new Map(provs.map((p) => [p.briefingId, p]))
  const sourcesByBriefing = new Map<string, (typeof allSources)>()
  for (const s of allSources) {
    const arr = sourcesByBriefing.get(s.briefingId) ?? []
    arr.push(s)
    sourcesByBriefing.set(s.briefingId, arr)
  }
  const tagsByBriefing = new Map<string, (typeof tagLinks)[number]['tag'][]>()
  for (const t of tagLinks) {
    const arr = tagsByBriefing.get(t.briefingId) ?? []
    arr.push(t.tag)
    tagsByBriefing.set(t.briefingId, arr)
  }

  return rows.map((r) => ({
    briefing: r.briefing,
    goalTitle: r.goalTitle,
    provenance: provByBriefing.get(r.briefing.id) ?? null,
    sources: (sourcesByBriefing.get(r.briefing.id) ?? []).sort(
      (a, b) => a.position - b.position,
    ),
    tags: tagsByBriefing.get(r.briefing.id) ?? [],
  }))
}

export async function countByPriority(userId: string): Promise<{
  total: number
  byPriority: Record<Briefing['priority'], number>
  thisWeek: number
}> {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(briefings)
    .where(eq(briefings.userId, userId))
  const [{ thisWeek }] = await db
    .select({ thisWeek: sql<number>`count(*)::int` })
    .from(briefings)
    .where(
      and(eq(briefings.userId, userId), gte(briefings.createdAt, oneWeekAgo)),
    )
  const byPrio = await db
    .select({
      priority: briefings.priority,
      n: sql<number>`count(*)::int`,
    })
    .from(briefings)
    .where(eq(briefings.userId, userId))
    .groupBy(briefings.priority)
  const byPriority: Record<Briefing['priority'], number> = {
    critical: 0,
    process: 0,
    opportunity: 0,
    signal: 0,
  }
  for (const row of byPrio) byPriority[row.priority] = Number(row.n)
  return {
    total: Number(total),
    byPriority,
    thisWeek: Number(thisWeek),
  }
}
