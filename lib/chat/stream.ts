import Anthropic from '@anthropic-ai/sdk'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { messages as messagesTable, threads, type User } from '@/db/schema'
import { OPUS } from '@/lib/agents/pricing'
import { priceUsd } from '@/lib/agents/pricing'
import { getValencyToken } from '@/lib/valency'
import {
  INTERNAL_TOOLS,
  executeInternalTool,
} from './internalTools'
import { buildSystemPrompt } from './systemPrompt'

const MCP_BETA_HEADER = 'mcp-client-2025-04-04'
const VALENCY_URL = 'https://labs.valency.io/mcp'

/** Hard ceiling per thread to keep costs bounded. */
const THREAD_TOKEN_CAP = 200_000

export interface ChatStreamInput {
  user: User
  threadId: string
  userMessage: string
  client?: Anthropic
}

export type StreamEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_use_start'; id: string; name: string; source: 'mcp' | 'internal' }
  | { type: 'tool_use_end'; id: string; input: unknown }
  | {
      type: 'tool_result'
      id: string
      content: unknown
      is_error?: boolean
      source: 'mcp' | 'internal'
    }
  | { type: 'usage'; tokensIn: number; tokensOut: number; costUsd: number }
  | { type: 'message_id'; id: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

export class ChatStreamError extends Error {
  constructor(
    message: string,
    public readonly status = 500,
  ) {
    super(message)
    this.name = 'ChatStreamError'
  }
}

/**
 * Runs one chat turn: persists the user message, then streams the assistant
 * response (with the Valency MCP server attached + internal tools). Yields
 * `StreamEvent`s as the agentic loop progresses.
 */
export async function* runChatTurn(
  input: ChatStreamInput,
): AsyncGenerator<StreamEvent, void, unknown> {
  const { user, threadId, userMessage } = input

  // Verify thread ownership + token cap.
  const [thread] = await db
    .select()
    .from(threads)
    .where(eq(threads.id, threadId))
  if (!thread || thread.userId !== user.id) {
    yield { type: 'error', message: 'thread not found' }
    return
  }
  if (thread.tokensIn + thread.tokensOut >= THREAD_TOKEN_CAP) {
    yield {
      type: 'error',
      message: `Thread token cap reached (${THREAD_TOKEN_CAP}). Start a new thread.`,
    }
    return
  }

  // Persist user message.
  const userContent: unknown[] = [{ type: 'text', text: userMessage }]
  await db.insert(messagesTable).values({
    threadId,
    role: 'user',
    contentJson: userContent,
  })

  // Reload all messages for the thread.
  const priorMsgs = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.threadId, threadId))
    .orderBy(messagesTable.createdAt)

  const systemPrompt = await buildSystemPrompt(user)
  const valencyToken = await getValencyToken(user.id)

  const anthropic =
    input.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // Build the message history for Anthropic. Skip system messages — system
  // is passed separately. Drop tool messages that are orphaned (we re-issue
  // tool_results from the contentJson when present).
  const toAnthropicMessages = (): Anthropic.Beta.Messages.BetaMessageParam[] =>
    priorMsgs
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.contentJson as unknown as Anthropic.Beta.Messages.BetaContentBlockParam[],
      }))

  const conversation: Anthropic.Beta.Messages.BetaMessageParam[] =
    toAnthropicMessages()

  const internalToolNames = new Set(INTERNAL_TOOLS.map((t) => t.name))

  let totalIn = 0
  let totalOut = 0
  let totalCost = 0
  const assistantContent: Anthropic.Beta.Messages.BetaContentBlock[] = []
  const toolUseSources = new Map<string, 'mcp' | 'internal'>()

  let iteration = 0
  while (iteration < 4) {
    iteration += 1

    const stream = anthropic.beta.messages.stream(
      {
        model: OPUS,
        max_tokens: 2048,
        system: systemPrompt,
        messages: conversation,
        tools: INTERNAL_TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema as Anthropic.Beta.Messages.BetaTool.InputSchema,
        })),
        ...(valencyToken
          ? {
              mcp_servers: [
                {
                  name: 'valency',
                  type: 'url',
                  url: VALENCY_URL,
                  authorization_token: valencyToken,
                },
              ],
            }
          : {}),
      },
      { headers: { 'anthropic-beta': MCP_BETA_HEADER } },
    )

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        const block = event.content_block
        if (block.type === 'tool_use') {
          toolUseSources.set(block.id, 'internal')
          yield {
            type: 'tool_use_start',
            id: block.id,
            name: block.name,
            source: 'internal',
          }
        } else if (block.type === 'mcp_tool_use') {
          toolUseSources.set(block.id, 'mcp')
          yield {
            type: 'tool_use_start',
            id: block.id,
            name: block.name,
            source: 'mcp',
          }
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield { type: 'text_delta', delta: event.delta.text }
        }
      }
    }

    const finalMessage = await stream.finalMessage()
    if (finalMessage.usage) {
      totalIn += finalMessage.usage.input_tokens ?? 0
      totalOut += finalMessage.usage.output_tokens ?? 0
      totalCost += priceUsd(
        OPUS,
        finalMessage.usage.input_tokens ?? 0,
        finalMessage.usage.output_tokens ?? 0,
      )
    }

    // Capture all blocks for persistence + emit MCP results to the client.
    for (const c of finalMessage.content) {
      assistantContent.push(c)
      if (c.type === 'tool_use') {
        yield { type: 'tool_use_end', id: c.id, input: c.input }
      } else if (c.type === 'mcp_tool_use') {
        yield { type: 'tool_use_end', id: c.id, input: c.input }
      } else if (c.type === 'mcp_tool_result') {
        yield {
          type: 'tool_result',
          id: c.tool_use_id,
          content: c.content,
          is_error: c.is_error,
          source: 'mcp',
        }
      }
    }

    if (finalMessage.stop_reason !== 'tool_use') {
      break
    }

    // Execute any internal tool calls server-side.
    const toolUses = finalMessage.content.filter(
      (c): c is Anthropic.Beta.Messages.BetaToolUseBlock =>
        c.type === 'tool_use' && internalToolNames.has(c.name),
    )
    if (toolUses.length === 0) {
      // The stop_reason was tool_use but the only tools were MCP — those were
      // resolved by Anthropic, so continue would just refetch. Break instead.
      break
    }

    // Append the assistant message + tool_results back into the conversation.
    conversation.push({
      role: 'assistant',
      content: finalMessage.content as Anthropic.Beta.Messages.BetaContentBlockParam[],
    })

    const toolResults: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = []
    for (const tu of toolUses) {
      const result = await executeInternalTool({
        userId: user.id,
        name: tu.name,
        input: tu.input,
      })
      const resultContent = JSON.stringify(result.data ?? null)
      yield {
        type: 'tool_result',
        id: tu.id,
        content: result.ok ? result.data : { error: result.error },
        is_error: !result.ok,
        source: 'internal',
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: result.ok ? resultContent : `error: ${result.error ?? 'unknown'}`,
        is_error: !result.ok,
      })
      // Mirror the tool_result into the assistant content for persistence.
      assistantContent.push({
        type: 'mcp_tool_result',
        tool_use_id: tu.id,
        content: result.ok
          ? [{ type: 'text', text: resultContent, citations: null }]
          : [
              {
                type: 'text',
                text: `error: ${result.error ?? 'unknown'}`,
                citations: null,
              },
            ],
        is_error: !result.ok,
      } as Anthropic.Beta.Messages.BetaContentBlock)
    }
    conversation.push({
      role: 'user',
      content: toolResults,
    })
  }

  // Persist assistant message + update thread totals.
  const [persisted] = await db
    .insert(messagesTable)
    .values({
      threadId,
      role: 'assistant',
      contentJson: assistantContent as unknown as unknown[],
      costUsd: totalCost,
      tokensIn: totalIn,
      tokensOut: totalOut,
    })
    .returning()

  await db
    .update(threads)
    .set({
      lastMessageAt: new Date(),
      tokensIn: thread.tokensIn + totalIn,
      tokensOut: thread.tokensOut + totalOut,
      costUsd: thread.costUsd + totalCost,
    })
    .where(eq(threads.id, threadId))

  yield { type: 'message_id', id: persisted.id }
  yield {
    type: 'usage',
    tokensIn: totalIn,
    tokensOut: totalOut,
    costUsd: totalCost,
  }
  yield { type: 'done' }
}

/** Wraps a StreamEvent generator into a Web ReadableStream of SSE bytes. */
export function eventsToSse(
  gen: AsyncGenerator<StreamEvent, void, unknown>,
): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const evt of gen) {
          controller.enqueue(
            enc.encode(`data: ${JSON.stringify(evt)}\n\n`),
          )
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        controller.enqueue(
          enc.encode(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`),
        )
      } finally {
        controller.close()
      }
    },
  })
}
