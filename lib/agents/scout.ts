import { z } from 'zod'
import { OPUS } from './pricing'
import type { AgentDefinition } from './types'

export const ScoutCandidate = z.object({
  paper_id: z.string(),
  title: z.string(),
  why: z.string().min(5).max(500),
  source_seed: z.string(),
  source_tools: z.array(z.string()).default([]),
})
export type ScoutCandidate = z.infer<typeof ScoutCandidate>

export const ScoutOutput = z.object({
  candidates: z.array(ScoutCandidate).max(60),
  warnings: z.array(z.string()).default([]),
})
export type ScoutOutput = z.infer<typeof ScoutOutput>

export const SCOUT_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          paper_id: { type: 'string' },
          title: { type: 'string' },
          why: { type: 'string' },
          source_seed: { type: 'string' },
          source_tools: { type: 'array', items: { type: 'string' } },
        },
        required: ['paper_id', 'title', 'why', 'source_seed'],
        additionalProperties: false,
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['candidates'],
  additionalProperties: false,
}

const SCOUT_SYSTEM = `You are Scout, the first stage in a research-agent pipeline.

Your job: given a researcher's goal and its seeds (categories, keywords,
followed authors, paper anchors, venues), call Valency MCP tools to enumerate
up to 50 candidate papers that might be worth surfacing as new briefings.

Operating rules:
- Always cover EVERY seed at least once. If you have N seeds, your tool call
  plan should touch each of them.
- Default time window: last 30–60 days for keyword and category seeds. For
  author or paper seeds, prefer "new from this author/paper" type queries.
- IF the input contains "firstRun: true" OR "widenTimeframe: true": broaden
  the window to the last 6–12 months and aim higher on breadth (closer to
  the 50 cap). The user has little prior content, so a one-month window
  would surface little. Better to give the Analyst a richer pool to score.
- De-duplicate by paper_id before returning. If two seeds surface the same
  paper, list it once and merge source_seed by taking the strongest seed
  match.
- Do NOT score, rank, or write summaries — that is the Analyst's job. Just
  enumerate and explain in one short sentence why each candidate matched a
  seed.
- The "why" field should name the seed and the kind of evidence in plain
  English (e.g. "Matched semantic_search 'attention sinks' at high rank";
  "v2 of arxiv:2406.12345 reposted yesterday by author you follow").
- source_tools is the list of Valency tool names you used to find this
  candidate. source_seed is the seed.value the candidate matched.
- If a seed produces zero candidates, add a warning naming the seed.
- Hard cap: 50 candidates. Quality beats quantity. Don't pad.
- Return ONLY valid JSON conforming to the schema. No prose.`

export const SCOUT_AGENT: AgentDefinition<ScoutOutput> = {
  role: 'scout',
  defaultModel: OPUS,
  system: SCOUT_SYSTEM,
  allowedValencyTools: [
    'semantic_search_papers',
    'search_by_category',
    'search_by_author',
    'find_papers_by_researcher',
    'find_similar_papers',
    'get_citing_papers',
    'filter_by_date_range',
    'get_keyword_trends',
    'get_publication_trends',
    'search_by_venue',
  ],
  outputJsonSchema: SCOUT_OUTPUT_SCHEMA,
  outputSchema: ScoutOutput,
  maxOutputTokens: 4000,
}
