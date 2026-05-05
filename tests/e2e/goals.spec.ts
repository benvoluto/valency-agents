import { expect, test } from '@playwright/test'
import { loginAs, randomEmail } from './_helpers/login'

test('create a goal with 2 keyword seeds + 1 ORCID seed', async ({
  page,
  context,
  request,
}) => {
  await loginAs(request, context, randomEmail('crud'), 'Goals Tester', {
    completeOnboarding: true,
  })

  await page.goto('/app/goals/new')
  await page.getByLabel('Title').fill('Long-context attention research')
  await page.getByLabel('Keywords').fill('long context, attention sinks')
  await page.getByLabel('Author ORCIDs').fill('0000-0002-1825-0097')
  await page.getByRole('button', { name: /create goal/i }).click()

  await expect(page).toHaveURL(/\/app\/goals\/[^/]+$/)
  await expect(
    page.getByRole('heading', { name: 'Long-context attention research' }),
  ).toBeVisible()

  const seedItems = page
    .locator('section', { hasText: 'Seeds' })
    .getByRole('listitem')
  await expect(seedItems.filter({ hasText: 'long context' })).toHaveCount(1)
  await expect(seedItems.filter({ hasText: 'attention sinks' })).toHaveCount(1)
  await expect(seedItems.filter({ hasText: '0000-0002-1825-0097' })).toHaveCount(1)
})

test('edit then delete a goal', async ({ page, context, request }) => {
  await loginAs(request, context, randomEmail('edit'), 'Edit Tester', {
    completeOnboarding: true,
  })

  await page.goto('/app/goals/new')
  await page.getByLabel('Title').fill('Doomed goal')
  await page.getByLabel('Keywords').fill('placeholder')
  await page.getByRole('button', { name: /create goal/i }).click()
  await expect(page).toHaveURL(/\/app\/goals\/[^/]+$/)
  await page.waitForLoadState('domcontentloaded')

  // Make sure React has hydrated before mutating an uncontrolled input.
  const detailsForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Save goal', exact: true }) })
  const titleInput = detailsForm.locator('input[name="title"]')
  await expect(titleInput).toBeEditable()
  await titleInput.click()
  await titleInput.press('ControlOrMeta+a')
  await titleInput.press('Backspace')
  await titleInput.pressSequentially('Renamed goal', { delay: 10 })
  await expect(titleInput).toHaveValue('Renamed goal')

  await detailsForm.getByRole('button', { name: 'Save goal', exact: true }).click()
  await expect(page).toHaveURL(/saved=1/, { timeout: 30_000 })
  await expect(
    page.getByRole('heading', { name: 'Renamed goal' }),
  ).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: /delete goal/i }).click()
  await expect(page).toHaveURL(/\/app\/goals$/)
  await expect(page.getByText('Renamed goal')).toHaveCount(0)
})
