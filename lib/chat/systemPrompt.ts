import { desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { briefings, follows, goals, type User } from '@/db/schema'

const SYSTEM_HEADER = `You are the conversational surface of Research Agents.
A small team of background agents is already producing daily briefings for
this researcher; you are the chat-time companion that lets them ask
follow-ups, dig into specific briefings, and run new searches.

Tools you have:
- The Valency MCP server (arXiv corpus + author intelligence). Use it for
  any query that needs the public scholarly record.
- A small set of internal tools (get_briefing, get_goal,
  list_recent_briefings, search_library) that give you context on the user's
  own briefings, goals, and library. Prefer these when the user references
  "my goal", "the briefing about X", "what I've saved", etc.

Operating rules:
- Be concrete. Cite paper ids and author ORCIDs when you reference them.
- Never invent papers. If Valency returns no results, say so.
- Keep replies short by default (≤ 5 sentences) unless the user asks for
  depth.
- Don't promise actions you can't perform. You can't email, save, or
  schedule on the user's behalf inside chat — point them at the briefing's
  action panel for those.
- When you call a tool, briefly tell the user what you're doing in one
  short sentence before the tool call ("Pulling your last 10 briefings…").`

export async function buildSystemPrompt(user: User): Promise<string> {
  const [activeGoals, recentBriefings, userFollows] = await Promise.all([
    db
      .select({
        id: goals.id,
        title: goals.title,
        description: goals.description,
        cadence: goals.cadence,
      })
      .from(goals)
      .where(eq(goals.userId, user.id))
      .orderBy(desc(goals.createdAt))
      .limit(8),
    db
      .select({
        id: briefings.id,
        title: briefings.title,
        priority: briefings.priority,
        kind: briefings.kind,
        confidence: briefings.confidence,
        createdAt: briefings.createdAt,
      })
      .from(briefings)
      .where(eq(briefings.userId, user.id))
      .orderBy(desc(briefings.createdAt))
      .limit(5),
    db
      .select({
        kind: follows.kind,
        refId: follows.refId,
        label: follows.label,
      })
      .from(follows)
      .where(eq(follows.userId, user.id))
      .orderBy(desc(follows.createdAt))
      .limit(10),
  ])

  const lines: string[] = [SYSTEM_HEADER, '']
  lines.push('## Researcher')
  lines.push(
    `- Name: ${user.name ?? '(not set)'}` +
      (user.affiliation ? ` · ${user.affiliation}` : '') +
      (user.orcid ? ` · ORCID ${user.orcid}` : ''),
  )

  if (activeGoals.length > 0) {
    lines.push('')
    lines.push('## Active goals')
    for (const g of activeGoals) {
      const desc = g.description ? ` — ${truncate(g.description, 140)}` : ''
      lines.push(`- ${g.id} · ${g.cadence} · "${truncate(g.title, 80)}"${desc}`)
    }
  }

  if (recentBriefings.length > 0) {
    lines.push('')
    lines.push('## Last 5 briefings')
    for (const b of recentBriefings) {
      lines.push(
        `- ${b.id} · ${b.priority} · ${b.kind} · conf ${b.confidence.toFixed(2)} · "${truncate(b.title, 80)}"`,
      )
    }
  }

  if (userFollows.length > 0) {
    lines.push('')
    lines.push('## Last 10 follows')
    for (const f of userFollows) {
      lines.push(`- ${f.kind} · ${f.refId}${f.label ? ` · ${f.label}` : ''}`)
    }
  }

  lines.push('')
  lines.push('Today is ' + new Date().toISOString().slice(0, 10) + '.')
  return lines.join('\n')
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}
