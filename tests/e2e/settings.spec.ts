import { expect, test } from '@playwright/test'
import { loginAs, randomEmail } from './_helpers/login'

test('settings page accepts a real Valency token, verifies, and stores last4', async ({
  page,
  context,
  request,
}) => {
  test.skip(
    !process.env.VALENCY_BEARER_TOKEN,
    'VALENCY_BEARER_TOKEN must be set for the live verify path',
  )
  await loginAs(request, context, randomEmail('set'), 'Settings Tester')

  await page.goto('/app/settings')
  await expect(
    page.getByRole('heading', { name: /valency token/i }),
  ).toBeVisible()

  const token = process.env.VALENCY_BEARER_TOKEN!
  await page.getByLabel(/new token|replace token/i).fill(token)
  await page.getByRole('button', { name: /verify & save/i }).click()

  await expect(page).toHaveURL(/saved=token/)
  const last4 = token.slice(-4)
  await expect(page.getByText(`····${last4}`)).toBeVisible()
})

test('settings rejects a bogus token', async ({ page, context, request }) => {
  await loginAs(request, context, randomEmail('bad'), 'Bad Token Tester')
  await page.goto('/app/settings')
  await page.getByLabel(/new token|replace token/i).fill('definitely-not-a-real-token')
  await page.getByRole('button', { name: /verify & save/i }).click()
  await expect(page).toHaveURL(/error=/)
})
