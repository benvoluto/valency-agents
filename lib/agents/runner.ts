import Anthropic from '@anthropic-ai/sdk'
import { eq, and, gte, sql } from 'drizzle-orm'
import { db } from '@/db'
import { agentRuns, agentSteps, type AgentRun } from '@/db/schema'
import { priceUsd } from './pricing'
import type { AgentDefinition } from './types'

const MCP_BETA_HEADER = 'mcp-client-2025-04-04'

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BudgetExceededError'
  }
}

export interface RunAgentOptions<T> {
  agent: AgentDefinition<T>
  userId: string
  goalId?: string
  parentRunId?: string
  /** The user-visible message — usually a JSON-serialized snapshot of upstream output. */
  userMessage: string
  /** Override default model (e.g. for budget-driven downgrade). */
  model?: string
  /** Optional Valency MCP server config; pass null to omit (Editor). */
  valency?: { url: string; token: string } | null
  client?: Anthropic
  signal?: AbortSignal
}

export interface RunAgentResult<T> {
  run: AgentRun
  output: T
}

/** Returns total spend (in USD) for `userId` since 00:00 UTC. */
export async function todaysSpendUsd(userId: string): Promise<number> {
  const start = new Date()
  start.setUTCHours(0, 0, 0, 0)
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${agentRuns.costUsd}), 0)` })
    .from(agentRuns)
    .where(and(eq(agentRuns.userId, userId), gte(agentRuns.startedAt, start)))
  return Number(row?.total ?? 0)
}

/** Asserts current spend is under the user's daily ceiling × `factor`. */
export async function assertWithinBudget(
  userId: string,
  ceilingUsd: number,
  factor = 1,
): Promise<void> {
  const spent = await todaysSpendUsd(userId)
  const limit = ceilingUsd * factor
  if (spent >= limit) {
    throw new BudgetExceededError(
      `User ${userId} hit budget ${spent.toFixed(4)} ≥ ${limit.toFixed(4)} USD`,
    )
  }
}

/**
 * Runs one agent role against Anthropic Messages with optional MCP server.
 * Records the entire call as one agentRun + per-tool agentSteps.
 *
 * Validates the assistant's final JSON output via the agent's Zod schema.
 * On Zod failure, retries once with the validation error appended to the
 * conversation. Throws on second failure.
 */
export async function runAgent<T>(opts: RunAgentOptions<T>): Promise<RunAgentResult<T>> {
  const {
    agent,
    userId,
    goalId,
    parentRunId,
    userMessage,
    valency,
    signal,
  } = opts
  const model = opts.model ?? agent.defaultModel
  const anthropic = opts.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const [run] = await db
    .insert(agentRuns)
    .values({
      userId,
      goalId,
      parentRunId,
      agent: agent.role,
      status: 'running',
    })
    .returning()

  let attempts = 0
  let parsed: T | null = null
  let totalIn = 0
  let totalOut = 0
  let totalCost = 0
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
    { role: 'user', content: userMessage },
  ]
  let lastError: Error | undefined

  while (attempts < 2) {
    attempts += 1
    try {
      const response = await anthropic.beta.messages.create(
        {
          model,
          max_tokens: agent.maxOutputTokens,
          system: agent.system,
          messages,
          ...(valency
            ? {
                mcp_servers: [
                  {
                    name: 'valency',
                    type: 'url',
                    url: valency.url,
                    authorization_token: valency.token,
                    tool_configuration:
                      agent.allowedValencyTools.length > 0
                        ? { allowed_tools: agent.allowedValencyTools }
                        : undefined,
                  },
                ],
              }
            : {}),
          output_config: {
            format: {
              type: 'json_schema',
              schema: agent.outputJsonSchema,
            },
          },
        },
        {
          signal,
          headers: { 'anthropic-beta': MCP_BETA_HEADER },
        },
      )

      // Cost + tokens
      const usage = response.usage
      const inputTokens = usage.input_tokens ?? 0
      const outputTokens = usage.output_tokens ?? 0
      totalIn += inputTokens
      totalOut += outputTokens
      totalCost += priceUsd(model, inputTokens, outputTokens)

      // Persist MCP tool steps from this response.
      await persistMcpSteps(run.id, response.content)

      // Find the final text/JSON block.
      const text = extractJsonText(response.content)
      if (!text) {
        throw new Error(`${agent.role}: no JSON output in response`)
      }
      let raw: unknown
      try {
        raw = JSON.parse(text)
      } catch (err) {
        throw new Error(`${agent.role}: response was not valid JSON: ${(err as Error).message}`)
      }
      parsed = agent.outputSchema.parse(raw)
      break
    } catch (err) {
      lastError = err as Error
      if (attempts >= 2) break
      // Reprompt with the validator error so the model can self-correct.
      messages.push({
        role: 'user',
        content: `Your previous response was rejected: ${lastError.message}\n\nTry again — return valid JSON matching the schema.`,
      })
    }
  }

  if (parsed === null) {
    await db
      .update(agentRuns)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        costUsd: totalCost,
        tokensIn: totalIn,
        tokensOut: totalOut,
        errorJson: { message: lastError?.message ?? 'unknown error' },
      })
      .where(eq(agentRuns.id, run.id))
    throw lastError ?? new Error(`${agent.role}: exhausted retries`)
  }

  const [updatedRun] = await db
    .update(agentRuns)
    .set({
      status: 'completed',
      finishedAt: new Date(),
      costUsd: totalCost,
      tokensIn: totalIn,
      tokensOut: totalOut,
    })
    .where(eq(agentRuns.id, run.id))
    .returning()

  return { run: updatedRun, output: parsed }
}

async function persistMcpSteps(
  runId: string,
  content: Array<Anthropic.Beta.Messages.BetaContentBlock>,
): Promise<void> {
  const blocks: Array<{
    ord: number
    toolName: string
    requestJson: Record<string, unknown> | null
    responseJson: Record<string, unknown> | null
    errorMessage: string | null
  }> = []
  let ord = 0
  // The toolUseId → blocks map lets us pair tool_use with tool_result.
  const useById = new Map<string, { name: string; input: unknown }>()
  const resultById = new Map<
    string,
    { content: unknown; isError: boolean }
  >()
  for (const c of content) {
    if (c.type === 'mcp_tool_use') {
      useById.set(c.id, { name: c.name, input: c.input })
    } else if (c.type === 'mcp_tool_result') {
      resultById.set(c.tool_use_id, {
        content: c.content,
        isError: c.is_error,
      })
    }
  }
  for (const [id, use] of useById) {
    ord += 1
    const result = resultById.get(id)
    blocks.push({
      ord,
      toolName: use.name,
      requestJson: (use.input ?? {}) as Record<string, unknown>,
      responseJson: result
        ? ({ content: result.content } as Record<string, unknown>)
        : null,
      errorMessage: result?.isError ? 'mcp_tool_result reported is_error' : null,
    })
  }
  if (blocks.length === 0) return
  await db.insert(agentSteps).values(
    blocks.map((b) => ({
      runId,
      ord: b.ord,
      kind: 'tool_call' as const,
      toolName: b.toolName,
      requestJson: b.requestJson,
      responseJson: b.responseJson,
      latencyMs: null,
      errorMessage: b.errorMessage,
    })),
  )
}

function extractJsonText(
  content: Array<Anthropic.Beta.Messages.BetaContentBlock>,
): string | null {
  // The structured-output flow returns the JSON in a final text block.
  for (let i = content.length - 1; i >= 0; i--) {
    const c = content[i]
    if (c.type === 'text' && c.text.trim().length > 0) {
      return c.text
    }
  }
  return null
}
