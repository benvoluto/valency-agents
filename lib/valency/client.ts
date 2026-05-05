import { z } from 'zod'
import { reserveToken } from './rate-limit'

const ENDPOINT = 'https://labs.valency.io/mcp'

export class ValencyError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly toolName?: string,
  ) {
    super(message)
    this.name = 'ValencyError'
  }
}

const RpcEnvelope = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  result: z
    .object({
      content: z.array(
        z.object({
          type: z.literal('text'),
          text: z.string(),
        }),
      ),
      isError: z.boolean().optional(),
    })
    .optional(),
  error: z
    .object({
      code: z.number(),
      message: z.string(),
      data: z.unknown().optional(),
    })
    .optional(),
})

export interface ToolCallStep {
  toolName: string
  request: object
  response: unknown
  latencyMs: number
  attempts: number
  requestId?: string
  error?: string
}

export type StepRecorder = (step: ToolCallStep) => void | Promise<void>

export interface ValencyClientOptions {
  token: string
  /** Identifier used for rate-limiting and log scoping. Typically `user.id`. */
  rateLimitKey?: string
  /** Override the global fetch — used by tests to inject mocks. */
  fetchImpl?: typeof fetch
  /** Hard timeout per attempt, in ms. */
  timeoutMs?: number
  /** Number of total attempts on 5xx / network failures. */
  maxAttempts?: number
  /** Optional callback invoked once per successful or failed call. */
  onStep?: StepRecorder
  /** Optional structured logger; defaults to one console.info line per call. */
  logger?: (event: ToolCallStep) => void
}

const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_MAX_ATTEMPTS = 3

export class ValencyClient {
  private readonly token: string
  private readonly rateLimitKey: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly maxAttempts: number
  private readonly onStep?: StepRecorder
  private readonly logger: (event: ToolCallStep) => void
  private nextId = 1

  constructor(opts: ValencyClientOptions) {
    if (!opts.token) throw new ValencyError('Valency token required')
    this.token = opts.token
    this.rateLimitKey = opts.rateLimitKey ?? 'anon'
    this.fetchImpl = opts.fetchImpl ?? fetch
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
    this.onStep = opts.onStep
    this.logger = opts.logger ?? defaultLogger
  }

  /** Generic typed tool call — parses the inner JSON payload with `schema`. */
  async callTool<T>(
    name: string,
    args: object,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const startedAt = Date.now()
    let lastError: Error | undefined
    let attempts = 0

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      attempts = attempt
      const wait = reserveToken(this.rateLimitKey)
      if (wait > 0) await sleep(wait)

      try {
        const result = await this.attempt(name, args, schema)
        const event: ToolCallStep = {
          toolName: name,
          request: args,
          response: result.parsed,
          latencyMs: Date.now() - startedAt,
          attempts,
          requestId: result.requestId,
        }
        this.logger(event)
        if (this.onStep) await this.onStep(event)
        return result.parsed
      } catch (err) {
        lastError = err as Error
        const retriable = isRetriable(err)
        if (!retriable || attempt === this.maxAttempts) break
        await sleep(backoffMs(attempt))
      }
    }

    const event: ToolCallStep = {
      toolName: name,
      request: args,
      response: null,
      latencyMs: Date.now() - startedAt,
      attempts,
      error: lastError?.message ?? 'unknown error',
    }
    this.logger(event)
    if (this.onStep) await this.onStep(event)
    throw lastError ?? new ValencyError('callTool exited without resolution', undefined, name)
  }

  private async attempt<T>(
    name: string,
    args: object,
    schema: z.ZodType<T>,
  ): Promise<{ parsed: T; requestId?: string }> {
    const id = this.nextId++
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    let response: Response
    try {
      response = await this.fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method: 'tools/call',
          params: { name, arguments: args },
        }),
        signal: controller.signal,
      })
    } catch (err) {
      const e = err as Error
      if (e.name === 'AbortError') {
        throw new ValencyError(
          `Valency call ${name} timed out after ${this.timeoutMs}ms`,
          undefined,
          name,
        )
      }
      throw new ValencyError(`Valency network error: ${e.message}`, undefined, name)
    } finally {
      clearTimeout(timer)
    }

    if (response.status >= 500) {
      throw new ValencyError(
        `Valency HTTP ${response.status} on ${name}`,
        response.status,
        name,
      )
    }
    if (!response.ok) {
      // 4xx is not retriable.
      const body = await response.text().catch(() => '')
      throw new ValencyError(
        `Valency HTTP ${response.status} on ${name}: ${body.slice(0, 200)}`,
        response.status,
        name,
      )
    }

    const envelope = RpcEnvelope.parse(await response.json())
    if (envelope.error) {
      throw new ValencyError(envelope.error.message, envelope.error.code, name)
    }
    if (!envelope.result) {
      throw new ValencyError('Empty result envelope', undefined, name)
    }

    const body = envelope.result.content[0]?.text
    if (!body) {
      throw new ValencyError('Empty content in tool result', undefined, name)
    }
    if (envelope.result.isError) {
      throw new ValencyError(body, undefined, name)
    }

    let raw: unknown
    try {
      raw = JSON.parse(body)
    } catch {
      throw new ValencyError(`Tool ${name} returned non-JSON: ${body}`, undefined, name)
    }
    const parsed = schema.parse(raw)
    const requestId = extractRequestId(raw)
    return { parsed, requestId }
  }
}

function isRetriable(err: unknown): boolean {
  if (err instanceof ValencyError) {
    if (err.code !== undefined && err.code >= 500) return true
    // Network / timeout errors have no HTTP code attached.
    return err.code === undefined
  }
  return false
}

function backoffMs(attempt: number): number {
  // 200ms, 600ms, 1800ms with ±20% jitter.
  const base = 200 * Math.pow(3, attempt - 1)
  const jitter = base * (Math.random() * 0.4 - 0.2)
  return Math.round(base + jitter)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function extractRequestId(raw: unknown): string | undefined {
  if (raw && typeof raw === 'object' && '_meta' in raw) {
    const meta = (raw as { _meta?: { request_id?: unknown } })._meta
    if (meta && typeof meta.request_id === 'string') return meta.request_id
  }
  return undefined
}

function defaultLogger(event: ToolCallStep) {
  // Stable single-line JSON for ingestion by Vercel logs / external sinks.
  const payload = {
    tag: 'valency.call',
    tool: event.toolName,
    latencyMs: event.latencyMs,
    attempts: event.attempts,
    requestId: event.requestId,
    error: event.error,
  }
  if (event.error) {
    console.warn(JSON.stringify(payload))
  } else {
    console.info(JSON.stringify(payload))
  }
}
