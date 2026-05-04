import { sql } from '@/db'

export const dynamic = 'force-dynamic'

type CheckResult = {
  ok: boolean
  latencyMs: number
  detail?: string
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: unknown; latencyMs: number }> {
  const start = Date.now()
  try {
    const value = await fn()
    return { value, latencyMs: Date.now() - start }
  } catch (error) {
    return { error, latencyMs: Date.now() - start }
  }
}

async function checkDb(): Promise<CheckResult> {
  const result = await timed(() => sql`select 1 as ok`)
  if (result.error) {
    return {
      ok: false,
      latencyMs: result.latencyMs,
      detail: errorMessage(result.error),
    }
  }
  return { ok: true, latencyMs: result.latencyMs }
}

async function checkAnthropic(): Promise<CheckResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { ok: false, latencyMs: 0, detail: 'ANTHROPIC_API_KEY not set' }
  }
  const result = await timed(() =>
    fetch('https://api.anthropic.com/v1/models?limit=1', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    }),
  )
  if (result.error) {
    return {
      ok: false,
      latencyMs: result.latencyMs,
      detail: errorMessage(result.error),
    }
  }
  const res = result.value!
  if (!res.ok) {
    return {
      ok: false,
      latencyMs: result.latencyMs,
      detail: `HTTP ${res.status}`,
    }
  }
  return { ok: true, latencyMs: result.latencyMs }
}

async function checkValency(): Promise<CheckResult> {
  const result = await timed(() => fetch('https://labs.valency.io/health'))
  if (result.error) {
    return {
      ok: false,
      latencyMs: result.latencyMs,
      detail: errorMessage(result.error),
    }
  }
  const res = result.value!
  if (!res.ok) {
    return {
      ok: false,
      latencyMs: result.latencyMs,
      detail: `HTTP ${res.status}`,
    }
  }
  return { ok: true, latencyMs: result.latencyMs }
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

export async function GET() {
  const [db, anthropic, valency] = await Promise.all([
    checkDb(),
    checkAnthropic(),
    checkValency(),
  ])

  const ok = db.ok && anthropic.ok && valency.ok
  const body = {
    ok,
    checks: { db, anthropic, valency },
    ts: new Date().toISOString(),
  }
  return Response.json(body, { status: ok ? 200 : 503 })
}
