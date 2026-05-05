import { expect, test } from '@playwright/test'
import { loginAs, randomEmail, seedBriefings } from './_helpers/login'

test('approve flips status and writes an audit entry', async ({
  page,
  context,
  request,
}) => {
  const email = randomEmail('approve')
  await loginAs(request, context, email, 'Approve Tester', {
    completeOnboarding: true,
  })
  await seedBriefings(request, email)

  await page.goto('/app?priority=critical')
  // Open the detail page where the Approve button lives.
  await page
    .getByRole('link', { name: /A v2 challenges the premise/ })
    .first()
    .click()
  await expect(page).toHaveURL(/\/app\/briefings\/[^/]+$/)

  await page.getByRole('button', { name: /^Approve$/ }).click()
  const modal = page.getByTestId('dry-run-modal')
  await expect(modal).toBeVisible()
  await modal.getByRole('button', { name: /^Confirm$/ }).click()
  await expect(modal).toHaveCount(0)

  // Status is now reflected in the action panel.
  await expect(
    page
      .getByTestId('briefing-actions')
      .getByText(/approved/i),
  ).toBeVisible({ timeout: 10_000 })

  // Audit timeline shows the action.
  const auditEntries = page.getByTestId('audit-entry')
  await expect(auditEntries.first()).toBeVisible()
  await expect(auditEntries.first()).toContainText(/approved "/i)
})

test('dismiss + undo writes a compensating audit entry', async ({
  page,
  context,
  request,
}) => {
  const email = randomEmail('dismiss')
  await loginAs(request, context, email, 'Dismiss Tester', {
    completeOnboarding: true,
  })
  await seedBriefings(request, email)

  await page.goto('/app?priority=critical')
  // Dismiss from the card.
  await page
    .getByTestId('briefing-actions')
    .first()
    .getByRole('button', { name: /^Dismiss$/ })
    .click()
  await page
    .getByTestId('dry-run-modal')
    .getByRole('button', { name: /^Confirm$/ })
    .click()

  // UndoBar appears.
  const undoBar = page.getByTestId('undo-bar')
  await expect(undoBar).toBeVisible({ timeout: 10_000 })
  await expect(undoBar).toContainText(/dismissed/i)

  await undoBar.getByRole('button', { name: /Undo/ }).click()

  // The dismissed card should reappear in the critical filter.
  await expect(
    page.getByRole('link', { name: /A v2 challenges the premise/ }),
  ).toBeVisible({ timeout: 10_000 })

  // Open the detail page and verify the audit timeline has both entries.
  await page
    .getByRole('link', { name: /A v2 challenges the premise/ })
    .first()
    .click()
  const entries = page.getByTestId('audit-entry')
  await expect(entries.first()).toBeVisible()
  // Filter to entries within the audit-entry container so the UndoBar's
  // copy doesn't cause strict-mode ambiguity.
  await expect(entries.filter({ hasText: /undid dismiss/i })).toHaveCount(1)
  await expect(entries.filter({ hasText: /dismissed "/i })).toHaveCount(1)
})

test('save creates follow rows and the briefing shows up in /app/library', async ({
  page,
  context,
  request,
}) => {
  const email = randomEmail('save')
  await loginAs(request, context, email, 'Save Tester', {
    completeOnboarding: true,
  })
  await seedBriefings(request, email)

  await page.goto('/app?priority=process')
  await page
    .getByTestId('briefing-actions')
    .first()
    .getByRole('button', { name: /Save to library|Save citation|Save profile|Save for draft|Save call|Pin trend|Pin method|Watch venue/ })
    .click()
  await page
    .getByTestId('dry-run-modal')
    .getByRole('button', { name: /^Confirm$/ })
    .click()

  await expect(page.getByTestId('undo-bar')).toBeVisible({ timeout: 10_000 })

  await page.goto('/app/library')
  const savedSection = page.locator('section', {
    has: page.getByRole('heading', { name: /Saved briefings/ }),
  })
  await expect(savedSection).toBeVisible()
  await expect(
    savedSection.getByText(/New paper on attention sinks at long context/),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: /Followed papers/ })).toBeVisible()
})

test('more like this creates a derived goal seeded with paper IDs', async ({
  page,
  context,
  request,
}) => {
  const email = randomEmail('mlt')
  await loginAs(request, context, email, 'MLT Tester', {
    completeOnboarding: true,
  })
  await seedBriefings(request, email)

  await page.goto('/app?priority=critical')
  await page
    .getByTestId('briefing-actions')
    .first()
    .getByRole('button', { name: /More like this/ })
    .click()
  await page
    .getByTestId('dry-run-modal')
    .getByRole('button', { name: /^Confirm$/ })
    .click()

  // Lands on the new goal's detail page.
  await expect(page).toHaveURL(/\/app\/goals\/[^/]+$/, { timeout: 10_000 })
  await expect(
    page.getByRole('heading', { name: /^Like: A v2 challenges/ }),
  ).toBeVisible()

  const seedItems = page
    .locator('section', { hasText: 'Seeds' })
    .getByRole('listitem')
  // The seeded counter-evidence briefing has paper_id 2602.18196v3 +
  // an author orcid as sources.
  await expect(seedItems.filter({ hasText: '2602.18196v3' })).toHaveCount(1)
  await expect(
    seedItems.filter({ hasText: '0000-0002-1825-0097' }),
  ).toHaveCount(1)
})
