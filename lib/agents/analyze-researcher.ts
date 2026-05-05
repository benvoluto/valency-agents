import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

export const ANALYZE_MODEL = 'claude-opus-4-7'

export const ResearchGoalCandidate = z.object({
  title: z.string().min(3).max(140),
  description: z.string().min(20).max(800),
  keywords: z.array(z.string().min(2)).min(1).max(8),
  source_paper_ids: z.array(z.string()).max(8),
})
export type ResearchGoalCandidate = z.infer<typeof ResearchGoalCandidate>

export const ResearchAnalysis = z.object({
  goals: z.array(ResearchGoalCandidate).min(1).max(8),
})
export type ResearchAnalysis = z.infer<typeof ResearchAnalysis>

const TOOL_NAME = 'submit_research_goals'

const SYSTEM = `You are an academic-research analyst. You receive a researcher's
public profile and a sample of their papers, and return a tight summary of
their distinct research threads.

Each "goal" you emit is a coherent research thread the researcher is actively
pursuing — not a single paper. Phrase the title in the active voice like an
agenda item ("Quantify X", "Disentangle Y from Z", "Design Q"). Phrase the
description in 1–3 sentences naming what they're trying to accomplish AND
why it matters to them or the field. Keep keywords short and specific
(2–4 words each). source_paper_ids must be drawn ONLY from the IDs the user
gave you.

Aim for 3–5 goals. Fewer is fine if the corpus is thin. Never invent papers
or fabricate institutions. If the input is too sparse to identify research
threads, return a single goal whose title says exactly: "Insufficient data
to summarize". Do not pad.`

export interface AnalyzeInput {
  name: string | null
  affiliation: string | null
  orcid: string | null
  papers: Array<{
    id: string
    title: string
    abstract?: string | null
    categories?: string[] | null
  }>
}

function userPrompt(input: AnalyzeInput): string {
  const lines: string[] = []
  lines.push(`Researcher: ${input.name ?? '(unknown)'}`)
  if (input.affiliation) lines.push(`Affiliation: ${input.affiliation}`)
  if (input.orcid) lines.push(`ORCID: ${input.orcid}`)
  lines.push(`\nPapers (${input.papers.length}):`)
  for (const p of input.papers) {
    lines.push(`\n[${p.id}] ${p.title}`)
    if (p.categories?.length) lines.push(`  categories: ${p.categories.join(', ')}`)
    if (p.abstract) {
      const trimmed = p.abstract.length > 1200 ? `${p.abstract.slice(0, 1200)}…` : p.abstract
      lines.push(`  abstract: ${trimmed}`)
    }
  }
  return lines.join('\n')
}

/** Calls Claude with a forced tool schema and returns parsed candidates. */
export async function analyzeResearcher(
  input: AnalyzeInput,
  opts: { client?: Anthropic; signal?: AbortSignal } = {},
): Promise<ResearchAnalysis> {
  if (input.papers.length === 0) {
    return { goals: [] }
  }
  const anthropic =
    opts.client ??
    new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })

  const response = await anthropic.messages.create(
    {
      model: ANALYZE_MODEL,
      max_tokens: 2048,
      system: SYSTEM,
      tools: [
        {
          name: TOOL_NAME,
          description:
            'Submit a list of inferred research goals for the researcher.',
          input_schema: {
            type: 'object',
            properties: {
              goals: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    keywords: { type: 'array', items: { type: 'string' } },
                    source_paper_ids: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                  required: [
                    'title',
                    'description',
                    'keywords',
                    'source_paper_ids',
                  ],
                },
              },
            },
            required: ['goals'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: userPrompt(input) }],
    },
    { signal: opts.signal },
  )

  const toolBlock = response.content.find((b) => b.type === 'tool_use')
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('Anthropic response missing tool_use block')
  }
  return ResearchAnalysis.parse(toolBlock.input)
}
