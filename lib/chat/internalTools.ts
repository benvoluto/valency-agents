import { and, desc, eq, ilike, or } from 'drizzle-orm'
import { db } from '@/db'
import {
  briefingProvenance,
  briefings,
  follows,
  goals,
  papers,
  type Briefing,
} from '@/db/schema'

/**
 * Tools the assistant can call to talk about *the user's stuff* in addition
 * to the Valency MCP. Defined in code, executed server-side, scoped to one
 * userId. The model never sees other users' data.
 */

export interface InternalToolDefinition {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export type InternalToolName =
  | 'get_briefing'
  | 'get_goal'
  | 'list_recent_briefings'
  | 'search_library'

export const INTERNAL_TOOLS: InternalToolDefinition[] = [
  {
    name: 'get_briefing',
    description:
      'Fetch one of the user\'s briefings by id. Returns title, summary, ' +
      'priority, kind, confidence, status, the Explain block (reasoning + ' +
      "what_i_will_do), and the briefing's sources. Use when the user asks " +
      'about a specific briefing they\'ve seen.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'briefing id (UUID)' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_goal',
    description:
      'Fetch one of the user\'s goals by id. Returns title, description, ' +
      'cadence, status, and the seeds.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'goal id (UUID)' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_recent_briefings',
    description:
      "List the user's most recent briefings, regardless of status. " +
      'Use when the user asks "what have I seen recently" or wants to ' +
      'reference past briefings.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'search_library',
    description:
      "Free-text search across the user's saved (status='acted') and " +
      "approved briefings + the papers they've followed. Returns up to 20 " +
      'matches.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
]

export interface ToolCallResult {
  ok: boolean
  data?: unknown
  error?: string
}

export async function executeInternalTool(args: {
  userId: string
  name: string
  input: unknown
}): Promise<ToolCallResult> {
  try {
    switch (args.name) {
      case 'get_briefing':
        return { ok: true, data: await getBriefing(args.userId, args.input) }
      case 'get_goal':
        return { ok: true, data: await getGoal(args.userId, args.input) }
      case 'list_recent_briefings':
        return {
          ok: true,
          data: await listRecentBriefings(args.userId, args.input),
        }
      case 'search_library':
        return { ok: true, data: await searchLibrary(args.userId, args.input) }
      default:
        return { ok: false, error: `unknown tool: ${args.name}` }
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function getBriefing(userId: string, input: unknown) {
  const id = (input as { id?: string }).id
  if (!id) throw new Error('id required')
  const [b] = await db
    .select()
    .from(briefings)
    .where(and(eq(briefings.id, id), eq(briefings.userId, userId)))
    .limit(1)
  if (!b) return null
  const [prov] = await db
    .select()
    .from(briefingProvenance)
    .where(eq(briefingProvenance.briefingId, id))
    .limit(1)
  return summarizeBriefing(b, prov)
}

async function getGoal(userId: string, input: unknown) {
  const id = (input as { id?: string }).id
  if (!id) throw new Error('id required')
  const [g] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, userId)))
    .limit(1)
  return g ?? null
}

async function listRecentBriefings(userId: string, input: unknown) {
  const limit = Math.min(20, Math.max(1, (input as { limit?: number }).limit ?? 10))
  const rows = await db
    .select()
    .from(briefings)
    .where(eq(briefings.userId, userId))
    .orderBy(desc(briefings.createdAt))
    .limit(limit)
  return rows.map((b) => ({
    id: b.id,
    title: b.title,
    kind: b.kind,
    priority: b.priority,
    confidence: b.confidence,
    status: b.status,
    createdAt: b.createdAt.toISOString(),
  }))
}

async function searchLibrary(userId: string, input: unknown) {
  const q = (input as { query?: string }).query?.trim()
  if (!q) throw new Error('query required')
  const pattern = `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%`
  const briefingRows = await db
    .select({
      id: briefings.id,
      title: briefings.title,
      kind: briefings.kind,
      status: briefings.status,
      summary: briefings.summary,
    })
    .from(briefings)
    .where(
      and(
        eq(briefings.userId, userId),
        or(
          ilike(briefings.title, pattern),
          ilike(briefings.summary, pattern),
        ),
      ),
    )
    .limit(15)
  const followRows = await db
    .select({
      kind: follows.kind,
      refId: follows.refId,
      label: follows.label,
    })
    .from(follows)
    .leftJoin(papers, eq(papers.id, follows.refId))
    .where(
      and(
        eq(follows.userId, userId),
        or(
          ilike(follows.label, pattern),
          ilike(papers.title, pattern),
        ),
      ),
    )
    .limit(10)
  return { briefings: briefingRows, follows: followRows }
}

function summarizeBriefing(
  b: Briefing,
  prov: typeof briefingProvenance.$inferSelect | undefined,
) {
  return {
    id: b.id,
    title: b.title,
    summary: b.summary,
    kind: b.kind,
    priority: b.priority,
    confidence: b.confidence,
    status: b.status,
    createdAt: b.createdAt.toISOString(),
    explain: prov
      ? {
          reasoning: prov.reasoning,
          what_i_will_do: prov.whatIWillDo,
        }
      : null,
  }
}
