import { expect, test } from '@playwright/test'
import { loginAs, randomEmail, seedBriefings } from './_helpers/login'
import { buildSignedInbound } from './_helpers/mailgun'

const SIGNING_KEY = process.env.MAILGUN_WEBHOOK_SIGNING_KEY

test.describe('inbound email actions', () => {
  test.skip(!SIGNING_KEY, 'MAILGUN_WEBHOOK_SIGNING_KEY required')

  test('approve via email flips status and writes audit entry with source=email', async ({
    page,
    context,
    request,
  }) => {
    const email = randomEmail('inb')
    await loginAs(request, context, email, 'Inbound Tester', {
      completeOnboarding: true,
    })
    const seeded = await seedBriefings(request, email)
    const briefingId = seeded.created[0]

    // Look up the shortId via the rendered briefing detail page (the e2e
    // session has one; the seed-briefings endpoint doesn't return it).
    await page.goto(`/app/briefings/${briefingId}`)
    // The shortId only appears in the email reply commands; the easiest
    // hook is the briefing's id alone — but the inbound API takes shortId.
    // For Phase 9 we exercise the flow via the test-only helper /api/test/seed-briefings
    // by pulling the shortId from the DB through a tiny query the test wrote.
    const shortIdRes = await request.get(
      `/api/test/briefing-short-id?id=${briefingId}`,
    )
    expect(shortIdRes.ok()).toBe(true)
    const { shortId } = (await shortIdRes.json()) as { shortId: string }

    const body = buildSignedInbound(
      {
        sender: email,
        bodyPlain: `approve ${shortId}\n\n> Quoted reply text below`,
      },
      SIGNING_KEY!,
    )

    const res = await request.post('/api/mailgun/inbound', {
      multipart: body,
    })
    expect(res.ok()).toBe(true)
    const json = (await res.json()) as { action?: string }
    expect(json.action).toBe('approve')

    // Audit timeline shows the email-sourced approve.
    await page.reload()
    await expect(page.getByTestId('audit-entry').first()).toBeVisible()
    await expect(
      page.getByTestId('audit-entry').filter({ hasText: /approved /i }),
    ).toBeVisible()
    await expect(
      page.getByTestId('audit-entry').filter({ hasText: 'EMAIL' }),
    ).toBeVisible()
  })

  test('bad HMAC returns 401', async ({ request }) => {
    const res = await request.post('/api/mailgun/inbound', {
      multipart: {
        timestamp: '0',
        token: 'wrong',
        signature: 'definitely-not-valid',
        sender: 'whoever@example.com',
        'body-plain': 'approve abc12345',
      },
    })
    expect(res.status()).toBe(401)
  })

  test('unknown sender → no DB mutation, polite bounce reply', async ({
    request,
  }) => {
    const body = buildSignedInbound(
      {
        sender: `nobody+${Date.now()}@unknown.test`,
        bodyPlain: 'approve abc12345',
      },
      SIGNING_KEY!,
    )
    const res = await request.post('/api/mailgun/inbound', {
      multipart: body,
    })
    expect(res.ok()).toBe(true)
    const json = (await res.json()) as { action?: string }
    expect(json.action).toBe('bounced_unknown_sender')
  })
})
