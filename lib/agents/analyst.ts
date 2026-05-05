import { z } from 'zod'
import { OPUS } from './pricing'
import type { AgentDefinition } from './types'

export const AnalystShortlistItem = z.object({
  paper_id: z.string(),
  title: z.string(),
  novelty: z.number().min(0).max(1),
  relevance: z.number().min(0).max(1),
  source_strength: z.number().min(0).max(1),
  composite: z.number().min(0).max(1),
  evidence: z.array(z.string()).min(1).max(6),
  flag: z
    .enum([
      'new_paper',
      'citation',
      'collaborator',
      'counter_evidence',
      'venue',
      'method_shift',
      'trend',
    ])
    .optional(),
})
export type AnalystShortlistItem = z.infer<typeof AnalystShortlistItem>

export const AnalystOutput = z.object({
  shortlist: z.array(AnalystShortlistItem).max(20),
  dropped_paper_ids: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
})
export type AnalystOutput = z.infer<typeof AnalystOutput>

export const ANALYST_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    shortlist: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          paper_id: { type: 'string' },
          title: { type: 'string' },
          novelty: { type: 'number' },
          relevance: { type: 'number' },
          source_strength: { type: 'number' },
          composite: { type: 'number' },
          evidence: {
            type: 'array',
            items: { type: 'string' },
          },
          flag: {
            type: 'string',
            enum: [
              'new_paper',
              'citation',
              'collaborator',
              'counter_evidence',
              'venue',
              'method_shift',
              'trend',
            ],
          },
        },
        required: [
          'paper_id',
          'title',
          'novelty',
          'relevance',
          'source_strength',
          'composite',
          'evidence',
        ],
        additionalProperties: false,
      },
    },
    dropped_paper_ids: { type: 'array', items: { type: 'string' } },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['shortlist'],
  additionalProperties: false,
}

const ANALYST_SYSTEM = `You are Analyst, stage 2 in a research-agent pipeline.

You receive Scout's candidate list. Your job is to score each candidate on
three axes and keep the top ≤15 that justify the user's attention right now.

Scoring axes (each in [0,1]):
- novelty:   How recent + how distinct from things the user has already seen.
              v2 with substantive change > v2 typo fix > older preprint.
- relevance: How directly the paper addresses the goal's core question.
              Do not over-credit shared keywords; weight conceptual fit.
- source_strength: Strength of the evidence chain. A paper surfaced via
              semantic-match alone is weaker than one surfaced via both
              category-recency AND a followed-author signal AND citing one
              of the user's anchor papers.

composite = a weighted aggregate you choose; 0.5 * relevance +
            0.3 * source_strength + 0.2 * novelty is a sensible default.
            Override only if you have a clear reason.

You may use a few Valency tools to enrich your view: find_similar_papers,
get_citing_papers, compare_authors, get_author_profile, analyze_corpus_metrics.
Use them sparingly — at most one tool call per candidate, only when the call
materially changes the score.

Evidence: 1–6 short bullets, each citing a concrete signal ("cited by 3
papers in the user's library", "v2 reframes the open question in goal X",
"author Y is on the user's follow list"). No vague phrases.

flag is your guess at the briefing kind the Editor should use; leave blank
if unsure.

dropped_paper_ids: list candidates you intentionally dropped from the
shortlist (off-topic, near-dupe of a stronger candidate, etc.) so the
Editor knows you considered them.

Hard cap: 15 items in shortlist. Quality beats quantity.

Return ONLY valid JSON conforming to the schema. No prose.`

export const ANALYST_AGENT: AgentDefinition<AnalystOutput> = {
  role: 'analyst',
  defaultModel: OPUS,
  system: ANALYST_SYSTEM,
  allowedValencyTools: [
    'find_similar_papers',
    'get_citing_papers',
    'compare_authors',
    'get_author_profile',
    'analyze_corpus_metrics',
  ],
  outputJsonSchema: ANALYST_OUTPUT_SCHEMA,
  outputSchema: AnalystOutput,
  maxOutputTokens: 4000,
}
