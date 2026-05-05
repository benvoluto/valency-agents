import { expect, test } from '@playwright/test'
import { loginAs, randomEmail } from './_helpers/login'

test('preview goal seeded with cs.LG returns ≥1 candidate', async ({
  page,
  context,
  request,
}) => {
  test.skip(
    !process.env.VALENCY_BEARER_TOKEN,
    'VALENCY_BEARER_TOKEN must be set for the live preview path',
  )
  await loginAs(request, context, randomEmail('prev'), 'Preview Tester', {
    completeOnboarding: true,
  })

  // Create a goal seeded with category cs.LG (known-stable, dense seed).
  await page.goto('/app/goals/new')
  await page.getByLabel('Title').fill('cs.LG preview test')
  // Tick the cs.LG checkbox by its accessible name.
  const csLg = page.getByRole('checkbox', { name: /^cs\.LG/ })
  await csLg.first().check({ timeout: 30_000 })
  await page.getByRole('button', { name: /create goal/i }).click()
  await expect(page).toHaveURL(/\/app\/goals\/[^/]+$/, { timeout: 30_000 })

  // Click Preview goal — synchronous call, may take ~2-3s.
  await page.getByRole('button', { name: /preview goal/i }).click()
  await expect(page).toHaveURL(/\/app\/runs\/[^/]+$/, { timeout: 60_000 })

  // The Candidates section should list at least one paper.
  const candidatesHeading = page.getByRole('heading', {
    name: /candidates \(\d+\)/i,
  })
  await expect(candidatesHeading).toBeVisible({ timeout: 30_000 })
  const headingText = (await candidatesHeading.textContent()) ?? ''
  const match = headingText.match(/\((\d+)\)/)
  const count = match ? Number.parseInt(match[1], 10) : 0
  expect(count).toBeGreaterThanOrEqual(1)
})
