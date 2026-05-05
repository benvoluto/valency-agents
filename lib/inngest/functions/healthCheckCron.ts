import { db } from '@/db'
import { healthChecks } from '@/db/schema'
import { inngest } from '../client'

interface ProbeResult {
  status: 'ok' | 'down'
  latencyMs: number
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value?: T; ok: boolean; latencyMs: number }> {
  const start = Date.now()
  try {
    const value = await fn()
    return { value, ok: true, latencyMs: Date.now() - start }
  } catch {
    return { ok: false, latencyMs: Date.now() - start }
  }
}

async function probeAnthropic(): Promise<ProbeResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { status: 'down', latencyMs: 0 }
  }
  const r = await timed(() =>
    fetch('https://api.anthropic.com/v1/models?limit=1', {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
    }).then((res) => {
      if (!res.ok) throw new Error(String(res.status))
      return res
    }),
  )
  return { status: r.ok ? 'ok' : 'down', latencyMs: r.latencyMs }
}

async function probeValency(): Promise<ProbeResult> {
  const r = await timed(() =>
    fetch('https://labs.valency.io/health').then((res) => {
      if (!res.ok) throw new Error(String(res.status))
      return res
    }),
  )
  return { status: r.ok ? 'ok' : 'down', latencyMs: r.latencyMs }
}

async function probeDb(): Promise<ProbeResult> {
  const r = await timed(async () => {
    const { sql } = await import('@/db')
    await sql`select 1 as ok`
  })
  return { status: r.ok ? 'ok' : 'down', latencyMs: r.latencyMs }
}

/**
 * Every 5 min, sample DB / Anthropic / Valency and persist a row. /status
 * reads the last 24h.
 */
export const healthCheckCron = inngest.createFunction(
  {
    id: 'health-check-cron',
    name: 'Health check probe',
    triggers: [{ cron: '*/5 * * * *' }],
    retries: 0,
  },
  async ({ step }) => {
    const [db_, anthropic, valency] = await step.run('probe', () =>
      Promise.all([probeDb(), probeAnthropic(), probeValency()]),
    )
    await step.run('persist', async () => {
      await db.insert(healthChecks).values({
        db: db_.status,
        anthropic: anthropic.status,
        valency: valency.status,
        dbLatencyMs: db_.latencyMs,
        anthropicLatencyMs: anthropic.latencyMs,
        valencyLatencyMs: valency.latencyMs,
      })
    })
    return { db: db_.status, anthropic: anthropic.status, valency: valency.status }
  },
)
