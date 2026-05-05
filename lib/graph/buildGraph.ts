import { and, desc, eq, gte, inArray } from 'drizzle-orm'
import { db } from '@/db'
import {
  briefingSources,
  briefingTags,
  briefings,
  papers,
  tags as tagsTable,
} from '@/db/schema'

export interface GraphNode {
  id: string
  label: string
  type: 'tag' | 'paper' | 'author' | 'briefing'
}

export interface GraphEdge {
  source: string
  target: string
  kind: 'tag-paper' | 'tag-author' | 'briefing-tag' | 'briefing-paper' | 'briefing-author'
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** Total nodes considered before the per-build cap kicked in. */
  rawCount: number
  /** True when the result was trimmed to satisfy the performance budget. */
  truncated: boolean
}

const MAX_NODES = 500
const WINDOW_DAYS = 90

/**
 * Builds the user's knowledge graph from the last 90 days of briefing
 * activity. Nodes: tags, papers, authors, briefings. Edges: derived from
 * briefingTags + briefingSources. Co-author / citation edges are out of
 * scope here (Phase 11 keeps the builder local-only — Phase 13+ can fan
 * those in via background Valency calls).
 */
export async function buildKnowledgeGraph(userId: string): Promise<GraphData> {
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const recentBriefings = await db
    .select({
      id: briefings.id,
      title: briefings.title,
      kind: briefings.kind,
      createdAt: briefings.createdAt,
    })
    .from(briefings)
    .where(and(eq(briefings.userId, userId), gte(briefings.createdAt, cutoff)))
    .orderBy(desc(briefings.createdAt))
    .limit(100)

  if (recentBriefings.length === 0) {
    return { nodes: [], edges: [], rawCount: 0, truncated: false }
  }

  const briefingIds = recentBriefings.map((b) => b.id)

  const [tagLinks, sourceRows] = await Promise.all([
    db
      .select({
        briefingId: briefingTags.briefingId,
        tag: tagsTable,
      })
      .from(briefingTags)
      .innerJoin(tagsTable, eq(tagsTable.id, briefingTags.tagId))
      .where(inArray(briefingTags.briefingId, briefingIds)),
    db
      .select()
      .from(briefingSources)
      .where(inArray(briefingSources.briefingId, briefingIds)),
  ])

  // Resolve paper titles where we know them.
  const paperRefs = Array.from(
    new Set(
      sourceRows.filter((s) => s.kind === 'paper').map((s) => s.refId),
    ),
  )
  const knownPapers =
    paperRefs.length > 0
      ? await db
          .select({ id: papers.id, title: papers.title })
          .from(papers)
          .where(inArray(papers.id, paperRefs))
      : []
  const paperTitleById = new Map(knownPapers.map((p) => [p.id, p.title]))

  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []

  // Briefing nodes
  for (const b of recentBriefings) {
    nodes.set(`b:${b.id}`, {
      id: `b:${b.id}`,
      label: trim(b.title, 60),
      type: 'briefing',
    })
  }

  // Tag nodes + briefing→tag edges
  for (const link of tagLinks) {
    const id = `t:${link.tag.id}`
    if (!nodes.has(id)) {
      nodes.set(id, { id, label: link.tag.label, type: 'tag' })
    }
    edges.push({
      source: `b:${link.briefingId}`,
      target: id,
      kind: 'briefing-tag',
    })
  }

  // Paper + author nodes from sources, plus briefing→paper and briefing→author edges
  for (const s of sourceRows) {
    if (s.kind === 'paper') {
      const id = `p:${s.refId}`
      if (!nodes.has(id)) {
        nodes.set(id, {
          id,
          label: paperTitleById.get(s.refId)
            ? trim(paperTitleById.get(s.refId)!, 60)
            : s.refId,
          type: 'paper',
        })
      }
      edges.push({
        source: `b:${s.briefingId}`,
        target: id,
        kind: 'briefing-paper',
      })
    } else if (s.kind === 'author') {
      const id = `a:${s.refId}`
      if (!nodes.has(id)) {
        nodes.set(id, {
          id,
          label: trim(s.snippet ?? s.refId, 60),
          type: 'author',
        })
      }
      edges.push({
        source: `b:${s.briefingId}`,
        target: id,
        kind: 'briefing-author',
      })
    }
  }

  // Tag→paper and tag→author edges (a tag connects to every paper/author
  // sourced from a briefing it labels). Handy for the layout to cluster.
  const briefingTagsByBriefing = new Map<string, string[]>()
  for (const l of tagLinks) {
    const arr = briefingTagsByBriefing.get(l.briefingId) ?? []
    arr.push(`t:${l.tag.id}`)
    briefingTagsByBriefing.set(l.briefingId, arr)
  }
  const linked = new Set<string>()
  for (const s of sourceRows) {
    const tags = briefingTagsByBriefing.get(s.briefingId)
    if (!tags) continue
    const target = s.kind === 'paper' ? `p:${s.refId}` : s.kind === 'author' ? `a:${s.refId}` : null
    if (!target) continue
    for (const tagId of tags) {
      const k = `${tagId}:${target}`
      if (linked.has(k)) continue
      linked.add(k)
      edges.push({
        source: tagId,
        target,
        kind: s.kind === 'paper' ? 'tag-paper' : 'tag-author',
      })
    }
  }

  const rawCount = nodes.size
  if (rawCount <= MAX_NODES) {
    return {
      nodes: [...nodes.values()],
      edges,
      rawCount,
      truncated: false,
    }
  }

  // Truncate by node-degree: keep the most-connected nodes.
  const degree = new Map<string, number>()
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
  }
  const trimmed = [...nodes.values()]
    .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))
    .slice(0, MAX_NODES)
  const keepIds = new Set(trimmed.map((n) => n.id))
  const filteredEdges = edges.filter(
    (e) => keepIds.has(e.source) && keepIds.has(e.target),
  )
  return {
    nodes: trimmed,
    edges: filteredEdges,
    rawCount,
    truncated: true,
  }
}

function trim(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}
