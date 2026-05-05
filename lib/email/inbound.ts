import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

const REGEX = /^(approve|dismiss|more|snooze)\s+([a-z0-9]{6,10})\b/i

export type InboundActionKind = 'approve' | 'dismiss' | 'more' | 'snooze'

export interface InboundIntent {
  kind: InboundActionKind | null
  shortId: string | null
  source: 'regex' | 'llm' | null
  confidence: number
}

const NEUTRAL: InboundIntent = {
  kind: null,
  shortId: null,
  source: null,
  confidence: 0,
}

/**
 * Parses the first non-empty line of an inbound email body (with quoted-reply
 * text already stripped). Tries the deterministic regex first; falls back to
 * a single Claude Haiku call only if regex misses.
 */
export async function parseInboundIntent(
  rawBody: string,
  opts: { client?: Anthropic; allowLlmFallback?: boolean } = {},
): Promise<InboundIntent> {
  const stripped = stripQuotedReply(rawBody)
  const firstLine = stripped
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  if (!firstLine) return NEUTRAL

  const m = REGEX.exec(firstLine)
  if (m) {
    return {
      kind: m[1].toLowerCase() as InboundActionKind,
      shortId: m[2].toLowerCase(),
      source: 'regex',
      confidence: 1,
    }
  }

  if (opts.allowLlmFallback === false) return NEUTRAL
  if (!process.env.ANTHROPIC_API_KEY) return NEUTRAL

  // Haiku fallback — cheap, constrained tool_use.
  return parseViaHaiku(stripped, opts.client)
}

const HAIKU_SCHEMA = {
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: ['approve', 'dismiss', 'more', 'snooze', 'none'],
    },
    short_id: { type: ['string', 'null'] },
    confidence: { type: 'number' },
  },
  required: ['kind', 'short_id', 'confidence'],
  additionalProperties: false,
} as const

const HaikuOutput = z.object({
  kind: z.enum(['approve', 'dismiss', 'more', 'snooze', 'none']),
  short_id: z.string().nullable(),
  confidence: z.number().min(0).max(1),
})

const HAIKU_SYSTEM = `You parse one-line action commands from an email reply
to a research-briefing digest. Decide which action the sender intends.

Return strict JSON conforming to the schema. Only emit a non-"none" kind if
both the action verb AND a 6–10 char alphanumeric short_id are confidently
present. If you can't extract a confident intent, emit kind:"none".

Confidence 1.0 = unambiguous. Below 0.7 = treat as "none".`

async function parseViaHaiku(
  body: string,
  client?: Anthropic,
): Promise<InboundIntent> {
  try {
    const anthropic =
      client ??
      new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await anthropic.beta.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: HAIKU_SYSTEM,
      messages: [{ role: 'user', content: body.slice(0, 2000) }],
      output_config: {
        format: { type: 'json_schema', schema: HAIKU_SCHEMA },
      },
    })
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')
    if (!text) return NEUTRAL
    const parsed = HaikuOutput.parse(JSON.parse(text))
    if (parsed.kind === 'none' || parsed.confidence < 0.7) return NEUTRAL
    if (!parsed.short_id) return NEUTRAL
    return {
      kind: parsed.kind,
      shortId: parsed.short_id.toLowerCase(),
      source: 'llm',
      confidence: parsed.confidence,
    }
  } catch {
    return NEUTRAL
  }
}

/**
 * Returns the body with quoted reply blocks stripped. Recognizes:
 * - Lines starting with ">"
 * - Common reply headers ("On <date> <name> wrote:", "From: …", "-- Original")
 */
export function stripQuotedReply(body: string): string {
  const lines = body.split(/\r?\n/)
  const cutoffPatterns = [
    /^>+\s/,
    /^On .+ wrote:\s*$/,
    /^On .+, at .+ wrote:\s*$/,
    /^From:\s/i,
    /^-{2,}\s*$/,
    /^-{2,}\s*Original Message\s*-{2,}/i,
    /^Sent from my /i,
  ]
  let cutoff = lines.length
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (cutoffPatterns.some((p) => p.test(l))) {
      cutoff = i
      break
    }
  }
  return lines.slice(0, cutoff).join('\n').trim()
}
