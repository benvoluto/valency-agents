'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CaretDown, CaretRight, PaperPlaneTilt, Wrench } from '@phosphor-icons/react'

interface PriorMessage {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  contentJson: unknown[]
  createdAt: string
}

interface InflightToolCall {
  id: string
  name: string
  source: 'mcp' | 'internal'
  input?: unknown
  result?: unknown
  isError?: boolean
}

interface InflightMessage {
  text: string
  tools: InflightToolCall[]
  done: boolean
  error?: string
}

export function ThreadView({
  threadId,
  initialMessages,
  autoSend,
}: {
  threadId: string
  initialMessages: PriorMessage[]
  autoSend: string | null
}) {
  const router = useRouter()
  const [messages] = useState(initialMessages)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<{
    user: string
    assistant: InflightMessage | null
  } | null>(null)
  const autoSentRef = useRef(false)

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      setPending({ user: trimmed, assistant: null })
      setDraft('')

      const inflight: InflightMessage = { text: '', tools: [], done: false }
      setPending((p) => (p ? { ...p, assistant: inflight } : p))

      try {
        const res = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ threadId, message: trimmed }),
        })
        if (!res.ok || !res.body) {
          const errBody = await res.json().catch(() => ({}))
          throw new Error(
            (errBody as { error?: string }).error ??
              `chat request failed (${res.status})`,
          )
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        outer: while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const events = buffer.split('\n\n')
          buffer = events.pop() ?? ''
          for (const evt of events) {
            const line = evt.split('\n').find((l) => l.startsWith('data:'))
            if (!line) continue
            const json = line.slice(5).trim()
            if (!json) continue
            const data = JSON.parse(json) as
              | { type: 'text_delta'; delta: string }
              | { type: 'tool_use_start'; id: string; name: string; source: 'mcp' | 'internal' }
              | { type: 'tool_use_end'; id: string; input: unknown }
              | { type: 'tool_result'; id: string; content: unknown; is_error?: boolean; source: 'mcp' | 'internal' }
              | { type: 'usage'; tokensIn: number; tokensOut: number; costUsd: number }
              | { type: 'message_id'; id: string }
              | { type: 'done' }
              | { type: 'error'; message: string }

            if (data.type === 'text_delta') {
              inflight.text += data.delta
              setPending((p) =>
                p?.assistant ? { ...p, assistant: { ...inflight } } : p,
              )
            } else if (data.type === 'tool_use_start') {
              inflight.tools = [
                ...inflight.tools,
                { id: data.id, name: data.name, source: data.source },
              ]
              setPending((p) =>
                p?.assistant ? { ...p, assistant: { ...inflight } } : p,
              )
            } else if (data.type === 'tool_use_end') {
              inflight.tools = inflight.tools.map((t) =>
                t.id === data.id ? { ...t, input: data.input } : t,
              )
              setPending((p) =>
                p?.assistant ? { ...p, assistant: { ...inflight } } : p,
              )
            } else if (data.type === 'tool_result') {
              inflight.tools = inflight.tools.map((t) =>
                t.id === data.id
                  ? { ...t, result: data.content, isError: data.is_error }
                  : t,
              )
              setPending((p) =>
                p?.assistant ? { ...p, assistant: { ...inflight } } : p,
              )
            } else if (data.type === 'error') {
              inflight.error = data.message
              inflight.done = true
              setPending((p) =>
                p?.assistant ? { ...p, assistant: { ...inflight } } : p,
              )
              break outer
            } else if (data.type === 'done') {
              inflight.done = true
              setPending((p) =>
                p?.assistant ? { ...p, assistant: { ...inflight } } : p,
              )
              break outer
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setPending((p) =>
          p?.assistant
            ? {
                ...p,
                assistant: { ...inflight, error: msg, done: true },
              }
            : p,
        )
      } finally {
        // Refresh server state so the persisted messages appear and the
        // inflight bubble can be cleared on the next render.
        router.refresh()
        setTimeout(() => setPending(null), 200)
      }
    },
    [threadId, router],
  )

  useEffect(() => {
    if (autoSend && !autoSentRef.current) {
      autoSentRef.current = true
      void send(autoSend)
    }
  }, [autoSend, send])

  return (
    <>
      <div className="space-y-4" data-testid="messages">
        {messages.map((m) => (
          <MessageBlock key={m.id} role={m.role} content={m.contentJson} />
        ))}
        {pending ? (
          <>
            <UserBubble text={pending.user} />
            {pending.assistant ? (
              <InflightAssistantBubble inflight={pending.assistant} />
            ) : null}
          </>
        ) : null}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send(draft)
        }}
        className="bg-surface border-border-subtle sticky bottom-4 mt-8 flex items-end gap-3 rounded-2xl border p-3"
      >
        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        <textarea
          id="chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Ask a follow-up…"
          disabled={!!pending}
          className="text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-accent flex-1 resize-none rounded-md bg-transparent px-2 py-1 text-sm disabled:opacity-50"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(draft)
            }
          }}
        />
        <button
          type="submit"
          disabled={!!pending || draft.trim().length === 0}
          className="bg-ink text-surface hover:bg-ink/90 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 inline-flex h-11 w-11 items-center justify-center rounded-md transition motion-reduce:transition-none disabled:opacity-30"
          aria-label="Send"
        >
          <PaperPlaneTilt size={16} weight="regular" aria-hidden />
        </button>
      </form>
    </>
  )
}

function MessageBlock({
  role,
  content,
}: {
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: unknown[]
}) {
  if (role === 'user') {
    const text = collectText(content)
    return <UserBubble text={text} />
  }
  if (role === 'assistant') {
    return <PersistedAssistantBubble blocks={content} />
  }
  return null
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end" data-testid="user-message">
      <div className="bg-ink text-surface max-w-prose rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
        {text}
      </div>
    </div>
  )
}

function PersistedAssistantBubble({ blocks }: { blocks: unknown[] }) {
  const text = collectText(blocks)
  const tools = collectToolCalls(blocks)
  return (
    <div className="flex justify-start" data-testid="assistant-message">
      <div className="border-border-subtle bg-surface text-ink max-w-prose space-y-2 rounded-2xl rounded-bl-sm border px-4 py-3 text-sm leading-relaxed">
        {tools.map((t) => (
          <ToolDisclosure key={t.id} tool={t} />
        ))}
        {text ? (
          <div className="whitespace-pre-wrap">{text}</div>
        ) : null}
      </div>
    </div>
  )
}

function InflightAssistantBubble({
  inflight,
}: {
  inflight: InflightMessage
}) {
  return (
    <div
      className="flex justify-start"
      data-testid="assistant-message-inflight"
    >
      <div className="border-border-subtle bg-surface text-ink max-w-prose space-y-2 rounded-2xl rounded-bl-sm border px-4 py-3 text-sm leading-relaxed">
        {inflight.tools.map((t) => (
          <ToolDisclosure key={t.id} tool={t} />
        ))}
        <div className="whitespace-pre-wrap">
          {inflight.text}
          {!inflight.done ? (
            <span className="bg-ink-muted ml-0.5 inline-block h-3 w-1.5 animate-pulse rounded-sm align-middle" />
          ) : null}
        </div>
        {inflight.error ? (
          <p className="text-priority-critical text-xs">{inflight.error}</p>
        ) : null}
      </div>
    </div>
  )
}

interface AssistantToolCall {
  id: string
  name: string
  source: 'mcp' | 'internal'
  input?: unknown
  result?: unknown
  isError?: boolean
}

function ToolDisclosure({ tool }: { tool: AssistantToolCall }) {
  const [open, setOpen] = useState(false)
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="border-border-subtle text-ink-muted rounded-md border bg-bg/40 px-2 py-1.5 text-xs"
      data-testid="tool-trace"
    >
      <summary className="flex cursor-pointer items-center gap-2 list-none">
        {open ? (
          <CaretDown size={12} weight="regular" aria-hidden />
        ) : (
          <CaretRight size={12} weight="regular" aria-hidden />
        )}
        <Wrench size={12} weight="regular" aria-hidden />
        <span className="font-mono text-[11px]">
          {tool.source === 'mcp' ? 'valency.' : ''}
          {tool.name}
        </span>
        {tool.isError ? (
          <span className="text-priority-critical font-mono text-[10px]">
            error
          </span>
        ) : null}
      </summary>
      <div className="mt-2 space-y-2 pl-5">
        {tool.input !== undefined ? (
          <pre className="bg-bg overflow-auto rounded p-2 font-mono text-[10px]">
            args: {JSON.stringify(tool.input, null, 2)}
          </pre>
        ) : null}
        {tool.result !== undefined ? (
          <pre className="bg-bg max-h-48 overflow-auto rounded p-2 font-mono text-[10px]">
            result: {trimResult(tool.result)}
          </pre>
        ) : null}
      </div>
    </details>
  )
}

function collectText(blocks: unknown[]): string {
  let out = ''
  for (const b of blocks) {
    if (b && typeof b === 'object' && 'type' in b && b.type === 'text') {
      out += (b as unknown as { text: string }).text
    }
  }
  return out
}

function collectToolCalls(blocks: unknown[]): AssistantToolCall[] {
  const result: AssistantToolCall[] = []
  const resultsByUseId = new Map<string, { content: unknown; isError: boolean }>()
  for (const b of blocks) {
    if (!b || typeof b !== 'object' || !('type' in b)) continue
    const block = b as Record<string, unknown> & { type: string }
    if (block.type === 'mcp_tool_result') {
      resultsByUseId.set(block.tool_use_id as string, {
        content: block.content,
        isError: !!block.is_error,
      })
    }
  }
  for (const b of blocks) {
    if (!b || typeof b !== 'object' || !('type' in b)) continue
    const block = b as Record<string, unknown> & { type: string }
    if (block.type === 'tool_use' || block.type === 'mcp_tool_use') {
      const id = block.id as string
      const r = resultsByUseId.get(id)
      result.push({
        id,
        name: block.name as string,
        source: block.type === 'mcp_tool_use' ? 'mcp' : 'internal',
        input: block.input,
        result: r?.content,
        isError: r?.isError,
      })
    }
  }
  return result
}

function trimResult(value: unknown): string {
  const s = JSON.stringify(value, null, 2)
  if (s.length <= 1500) return s
  return `${s.slice(0, 1500)}\n…`
}
