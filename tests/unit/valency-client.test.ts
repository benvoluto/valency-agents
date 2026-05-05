import { afterEach, describe, expect, it } from 'vitest'
import { ValencyClient, ValencyError } from '@/lib/valency/client'
import { tools as valency } from '@/lib/valency/tools'
import { __resetRateLimitForTests } from '@/lib/valency/rate-limit'

afterEach(() => __resetRateLimitForTests())

function mockResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function envelope(inner: unknown, isError = false) {
  return {
    jsonrpc: '2.0',
    id: 1,
    result: {
      content: [{ type: 'text', text: JSON.stringify(inner) }],
      isError,
    },
  }
}

describe('ValencyClient', () => {
  it('parses a tools/call response and validates with the supplied schema', async () => {
    const inner = {
      orcid: '0000-0002-1825-0097',
      profile: { display_name: 'Josiah Carberry' },
      count: 1,
      warnings: [],
      papers_in_corpus: [],
    }
    const fetchImpl = (async () => mockResponse(envelope(inner))) as typeof fetch
    const client = new ValencyClient({
      token: 't',
      fetchImpl,
      maxAttempts: 1,
    })
    const result = await valency.resolveOrcid(client, {
      orcid: '0000-0002-1825-0097',
    })
    expect(result.profile?.display_name).toBe('Josiah Carberry')
  })

  it('throws ValencyError when isError=true', async () => {
    const fetchImpl = (async () =>
      mockResponse({
        jsonrpc: '2.0',
        id: 1,
        result: {
          content: [
            {
              type: 'text',
              text: "Input validation error: 'author' is required",
            },
          ],
          isError: true,
        },
      })) as typeof fetch
    const client = new ValencyClient({
      token: 't',
      fetchImpl,
      maxAttempts: 1,
    })
    await expect(
      valency.findCoauthors(client, { author: '' }),
    ).rejects.toBeInstanceOf(ValencyError)
  })

  it('throws ValencyError on JSON-RPC error envelope', async () => {
    const fetchImpl = (async () =>
      mockResponse({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32600, message: 'Invalid request' },
      })) as typeof fetch
    const client = new ValencyClient({
      token: 't',
      fetchImpl,
      maxAttempts: 1,
    })
    await expect(valency.listSources(client)).rejects.toThrow(/Invalid request/)
  })

  it('throws on HTTP 4xx without retrying', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls++
      return new Response('unauthorized', { status: 401 })
    }) as typeof fetch
    const client = new ValencyClient({
      token: 'bad',
      fetchImpl,
      maxAttempts: 3,
    })
    await expect(valency.listSources(client)).rejects.toThrow(/401/)
    expect(calls).toBe(1)
  })

  it('retries on HTTP 5xx and succeeds on second attempt', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls++
      if (calls === 1) return new Response('boom', { status: 503 })
      return mockResponse(
        envelope({
          count: 1,
          sources: [
            {
              source: 'arxiv',
              paper_count: 1,
            },
          ],
        }),
      )
    }) as typeof fetch
    const client = new ValencyClient({
      token: 't',
      fetchImpl,
      maxAttempts: 3,
    })
    const r = await valency.listSources(client)
    expect(r.count).toBe(1)
    expect(calls).toBe(2)
  })

  it('invokes onStep with latency, attempts, requestId', async () => {
    const fetchImpl = (async () =>
      mockResponse(
        envelope({
          count: 1,
          sources: [{ source: 'arxiv', paper_count: 1 }],
          _meta: { request_id: 'req-abc' },
        }),
      )) as typeof fetch
    const steps: Array<{ tool?: string; reqId?: string; attempts?: number }> = []
    const client = new ValencyClient({
      token: 't',
      fetchImpl,
      onStep: (s) => {
        steps.push({
          tool: s.toolName,
          reqId: s.requestId,
          attempts: s.attempts,
        })
      },
      logger: () => {},
    })
    await valency.listSources(client)
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({
      tool: 'list_sources',
      reqId: 'req-abc',
      attempts: 1,
    })
  })
})
