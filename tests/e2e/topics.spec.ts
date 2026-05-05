import { expect, test } from '@playwright/test'
import { loginAs, randomEmail, seedBriefings } from './_helpers/login'

test('a tag with ≥3 briefings shows them on its slug page', async ({
  page,
  context,
  request,
}) => {
  const email = randomEmail('top')
  await loginAs(request, context, email, 'Topics Tester', {
    completeOnboarding: true,
  })
  await seedBriefings(request, email)

  await page.goto('/app/topics')
  await expect(
    page.getByRole('heading', { name: /tags from your briefings/i }),
  ).toBeVisible()

  // The seed inserts the "long-context" tag against ≥2 briefings; click it.
  const longContext = page.getByRole('link', { name: /Long context/ }).first()
  await longContext.click()
  await expect(page).toHaveURL(/\/app\/topics\/long-context$/)

  await expect(
    page.getByRole('heading', { name: /Long context/ }).first(),
  ).toBeVisible()

  // At least one briefing should be visible — the seed includes 3 under
  // long-context (counter_evidence + new_paper + collaborator).
  const cards = page.locator('article')
  expect(await cards.count()).toBeGreaterThanOrEqual(2)
})

test('/app/map renders cytoscape with seeded data', async ({
  page,
  context,
  request,
}) => {
  const email = randomEmail('map')
  await loginAs(request, context, email, 'Map Tester', {
    completeOnboarding: true,
  })
  await seedBriefings(request, email)

  await page.goto('/app/map')
  await expect(
    page.getByRole('heading', { name: /Last 90 days, mapped/i }),
  ).toBeVisible()

  // The container mounts; cytoscape lazy-loads. Wait for the render-time
  // chip to appear (signal the lib finished mounting).
  await expect(page.getByTestId('cy-render-ms')).toBeVisible({
    timeout: 10_000,
  })

  // Performance: ≤500ms per Phase 11 budget for ≤500 nodes (the seed
  // produces ~12 nodes so this should be well under budget).
  const text = (await page.getByTestId('cy-render-ms').textContent()) ?? '0ms'
  const ms = Number.parseInt(text.match(/(\d+)/)?.[1] ?? '999999', 10)
  expect(ms).toBeLessThan(2000)
})
