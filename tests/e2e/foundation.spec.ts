import { expect, test } from '@playwright/test'

test('landing page shows Google sign-in', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: /continue with google/i }),
  ).toBeVisible()
})

test('/app redirects to landing when signed out', async ({ page }) => {
  const response = await page.goto('/app')
  expect(response?.status()).toBeLessThan(400)
  await expect(page).toHaveURL(/\/\?next=%2Fapp$|\/$/)
  await expect(
    page.getByRole('button', { name: /continue with google/i }),
  ).toBeVisible()
})

test('/api/health returns JSON with checks', async ({ request }) => {
  const res = await request.get('/api/health')
  // Allow 200 or 503 — depends on whether the env is reachable from CI runners.
  expect([200, 503]).toContain(res.status())
  const body = await res.json()
  expect(body).toHaveProperty('checks.db')
  expect(body).toHaveProperty('checks.anthropic')
  expect(body).toHaveProperty('checks.valency')
})
