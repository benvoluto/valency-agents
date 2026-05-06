import { z } from 'zod'
import { OPUS } from './pricing'
import type { AgentDefinition } from './types'

export const EditorBriefingSource = z.object({
  kind: z.enum(['paper', 'author', 'query', 'tool_call', 'web']),
  ref_id: z.string(),
  snippet: z.string().nullable().optional(),
  weight: z.number().min(0).max(1).default(1),
})
export type EditorBriefingSource = z.infer<typeof EditorBriefingSource>

export const EditorBriefing = z.object({
  kind: z.enum([
    'new_paper',
    'citation',
    'trend',
    'collaborator',
    'counter_evidence',
    'venue',
    'method_shift',
    'funder',
  ]),
  priority: z.enum(['critical', 'process', 'opportunity', 'signal']),
  title: z.string().min(8).max(140),
  summary: z.string().min(20).max(800),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(20).max(1500),
  what_i_will_do: z.string().min(10).max(600),
  scope: z.record(z.string(), z.unknown()).default({}),
  alternatives_considered: z.array(z.string()).default([]),
  sources: z.array(EditorBriefingSource).min(1).max(8),
  tag_slugs: z.array(z.string()).default([]),
})
export type EditorBriefing = z.infer<typeof EditorBriefing>

export const EditorOutput = z.object({
  briefings: z.array(EditorBriefing).max(9),
  passed_over: z
    .array(
      z.object({
        paper_id: z.string(),
        reason: z.string(),
      }),
    )
    .default([]),
})
export type EditorOutput = z.infer<typeof EditorOutput>

export const EDITOR_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    briefings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: [
              'new_paper',
              'citation',
              'trend',
              'collaborator',
              'counter_evidence',
              'venue',
              'method_shift',
              'funder',
            ],
          },
          priority: {
            type: 'string',
            enum: ['critical', 'process', 'opportunity', 'signal'],
          },
          title: { type: 'string' },
          summary: { type: 'string' },
          confidence: { type: 'number' },
          reasoning: { type: 'string' },
          what_i_will_do: { type: 'string' },
          scope: {
            type: 'object',
            properties: {
              date_range: { type: ['string', 'null'] },
              categories: { type: 'array', items: { type: 'string' } },
              notes: { type: ['string', 'null'] },
            },
            required: ['date_range', 'categories', 'notes'],
            additionalProperties: false,
          },
          alternatives_considered: {
            type: 'array',
            items: { type: 'string' },
          },
          sources: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                kind: {
                  type: 'string',
                  enum: ['paper', 'author', 'query', 'tool_call', 'web'],
                },
                ref_id: { type: 'string' },
                snippet: { type: ['string', 'null'] },
                weight: { type: 'number' },
              },
              required: ['kind', 'ref_id'],
              additionalProperties: false,
            },
          },
          tag_slugs: { type: 'array', items: { type: 'string' } },
        },
        required: [
          'kind',
          'priority',
          'title',
          'summary',
          'confidence',
          'reasoning',
          'what_i_will_do',
          'sources',
        ],
        additionalProperties: false,
      },
    },
    passed_over: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          paper_id: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['paper_id', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['briefings'],
  additionalProperties: false,
}

const EDITOR_SYSTEM = `You are Editor, the final stage in a research-agent pipeline.

You receive Analyst's ranked shortlist (with novelty/relevance/source_strength
scores) plus the Librarian's normalized papers, authors, and tag set. You
have NO Valency tools — every claim you make MUST be grounded in a row from
the upstream output. Do not introduce facts that aren't in the input.

Pick up to 9 briefings the user should see today. Each briefing is one card.

If the upstream input contains nothing meaningful — empty Analyst shortlist,
no relevant Librarian papers/authors/tags, no signal worth a card — then
return an empty briefings array. NEVER fabricate filler cards like "No new
evidence today on X" or "Analyst returned an empty shortlist". Those are
noise dressed up as signal and they erode user trust. Silence is the
correct output when there is no signal.

For each briefing produce:
- kind:      one of new_paper, citation, trend, collaborator, counter_evidence,
             venue, method_shift, funder. Pick the most accurate label given
             the underlying evidence (Analyst's flag is a hint, not gospel).
- priority:  one of critical (counter-evidence, near-deadline), process
             (incoming work that affects an in-flight task), opportunity
             (collaborator, venue, funder), signal (trend, method shift,
             general interest).
- title:     8–140 chars, plain English, the headline a colleague would
             actually read at a glance.
- summary:   20–800 chars, 1–3 sentences. Name the paper(s)/author(s) AND
             why the user cares.
- confidence: in [0,1], calibrated. ≥0.90 = High; 0.70–0.89 = Medium;
             0.50–0.69 = Low. NEVER emit < 0.50 — drop the briefing instead.
- reasoning: 20–1500 chars. The Explain-drawer text. Lead with "Why this
             surfaced." Cite the seeds, the analyst's evidence rows, the
             librarian's tags. Plain English, no jargon.
- what_i_will_do: 10–600 chars. Concrete actions, no consequence-bearing
             ones. "I will save this to your library and draft a paragraph
             for your section 3 against this v2." NEVER promise actions
             outside the system's reach (no email send, no calendar,
             no sharing).
- scope:     object with three keys describing what you considered:
             date_range (string or null, e.g. "last 30 days"), categories
             (array of strings, e.g. ["cs.LG"]), notes (string or null,
             one short line of free-form context).
- alternatives_considered: 0–5 short notes on what you almost surfaced
             instead and why you didn't.
- sources:   1–8 entries, each pointing to a concrete row from the upstream
             output. "kind: paper, ref_id: <paper_id>" is the most common.
             "kind: author, ref_id: <orcid or display_name>" works too.
             Snippet is an optional 1-line excerpt.
- tag_slugs: 0–5 slugs from the Librarian's tag set (do not invent slugs).

Rules:
- Do not write more than one briefing per source paper unless the kind
  differs (e.g. one new_paper card AND one citation card pointing at the
  same paper is fine).
- Do not invent source ref_ids that aren't in the upstream input.
- Sort briefings by priority (critical, process, opportunity, signal) then
  by confidence descending.
- passed_over: list 0–10 paper_ids the analyst shortlisted that you didn't
  surface, each with a one-line reason. This drives the audit trail.

Return ONLY valid JSON conforming to the schema. No prose.`

export const EDITOR_AGENT: AgentDefinition<EditorOutput> = {
  role: 'editor',
  defaultModel: OPUS,
  system: EDITOR_SYSTEM,
  allowedValencyTools: [],
  outputJsonSchema: EDITOR_OUTPUT_SCHEMA,
  outputSchema: EditorOutput,
  maxOutputTokens: 6000,
}
