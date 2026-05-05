import type { APIRequestContext, BrowserContext } from '@playwright/test'

export async function loginAs(
  request: APIRequestContext,
  context: BrowserContext,
  email: string,
  name: string,
  opts: { completeOnboarding?: boolean } = {},
): Promise<{ userId: string }> {
  const res = await request.post('/api/test/login', {
    data: { email, name, completeOnboarding: opts.completeOnboarding ?? false },
  })
  if (!res.ok()) {
    throw new Error(
      `test login failed (${res.status()}). Set E2E_TEST_MODE=true on the server.`,
    )
  }
  const cookies = res.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie')
  for (const c of cookies) {
    const [pair] = c.value.split(';')
    const [name, value] = pair.split('=')
    await context.addCookies([
      {
        name,
        value,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ])
  }
  return (await res.json()) as { userId: string }
}

/** Random email with a deterministic suffix so tests don't clobber each other. */
export function randomEmail(prefix = 'e2e'): string {
  const suffix = Math.random().toString(36).slice(2, 10)
  return `${prefix}+${suffix}@e2e.test`
}

/** Seeds a deterministic briefing set for the given email via the test endpoint. */
export async function seedBriefings(
  request: APIRequestContext,
  email: string,
): Promise<{ created: string[] }> {
  const res = await request.post('/api/test/seed-briefings', {
    data: { email },
  })
  if (!res.ok()) {
    throw new Error(`seedBriefings failed (${res.status()})`)
  }
  return (await res.json()) as { created: string[] }
}
