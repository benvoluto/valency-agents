import { expect, test } from '@playwright/test'
import { loginAs, randomEmail, seedBriefings } from './_helpers/login'

test('home renders all four priority briefings from real DB rows', async ({
  page,
  context,
  request,
}) => {
  const email = randomEmail('feed')
  await loginAs(request, context, email, 'Feed Tester', {
    completeOnboarding: true,
  })
  await seedBriefings(request, email)

  await page.goto('/app')
  await expect(page).toHaveURL(/\/app$/)

  // The four seeded briefing titles.
  await expect(
    page.getByRole('link', { name: /A v2 challenges the premise/ }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', {
      name: /New paper on attention sinks at long context/,
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: /Dr\. P at MIT has 2 papers adjacent/ }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: /Method M usage in cs\.LG is up 38% YoY/ }),
  ).toBeVisible()

  // All four priority badges.
  await expect(page.getByText('CRITICAL', { exact: true })).toBeVisible()
  await expect(page.getByText('IN PROCESS', { exact: true })).toBeVisible()
  await expect(page.getByText('OPPORTUNITY', { exact: true })).toBeVisible()
  await expect(page.getByText('SIGNAL', { exact: true })).toBeVisible()
})

test('filter chip narrows the feed to a single priority', async ({
  page,
  context,
  request,
}) => {
  const email = randomEmail('filter')
  await loginAs(request, context, email, 'Filter Tester', {
    completeOnboarding: true,
  })
  await seedBriefings(request, email)

  await page.goto('/app')
  await page.getByRole('link', { name: /^Critical/ }).click()
  await expect(page).toHaveURL(/\/app\?priority=critical$/)
  await expect(
    page.getByRole('link', { name: /A v2 challenges the premise/ }),
  ).toBeVisible()
  // The signal-priority briefing should be hidden.
  await expect(
    page.getByRole('link', { name: /Method M usage in cs\.LG/ }),
  ).toHaveCount(0)
})

test('Explain drawer shows reasoning, sources, confidence, and what I will do', async ({
  page,
  context,
  request,
}) => {
  const email = randomEmail('exp')
  await loginAs(request, context, email, 'Explain Tester', {
    completeOnboarding: true,
  })
  await seedBriefings(request, email)

  await page.goto('/app?priority=critical')
  // Open the Explain drawer for the critical (counter-evidence) card.
  await page.getByRole('button', { name: /^Explain$/ }).first().click()

  const drawer = page.getByTestId('explain-drawer')
  await expect(drawer).toBeVisible()

  await expect(drawer.getByRole('heading', { name: /Why this surfaced/i })).toBeVisible()
  await expect(drawer.getByRole('heading', { name: /What I looked at/i })).toBeVisible()
  await expect(drawer.getByRole('heading', { name: /Confidence/i })).toBeVisible()
  await expect(
    drawer.getByRole('heading', { name: /What I will and won/i }),
  ).toBeVisible()

  // The seeded counter-evidence reasoning should be present.
  await expect(drawer.getByText(/v2 abstract directly contradicts/i)).toBeVisible()

  // Close via Escape.
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
})

test('Show sources popover lists chips, and clicking one routes to detail', async ({
  page,
  context,
  request,
}) => {
  const email = randomEmail('src')
  await loginAs(request, context, email, 'Sources Tester', {
    completeOnboarding: true,
  })
  await seedBriefings(request, email)

  await page.goto('/app')
  await page.getByRole('button', { name: /^Show sources$/ }).first().click()

  const popover = page.getByTestId('sources-popover').first()
  await expect(popover).toBeVisible()

  const chips = popover.getByTestId('source-chip')
  await expect(chips.first()).toBeVisible()
  expect(await chips.count()).toBeGreaterThanOrEqual(1)

  await chips.first().click()
  await expect(page).toHaveURL(/\/app\/briefings\/[^/]+#source-/)
  await expect(page.getByTestId('source-row').first()).toBeVisible()
})
