import { expect, test } from '@playwright/test'
import { loginAs, randomEmail } from './_helpers/login'

test('changing cadence updates the next-run-at chip on the goal page', async ({
  page,
  context,
  request,
}) => {
  await loginAs(request, context, randomEmail('cad'), 'Cadence Tester', {
    completeOnboarding: true,
  })

  // Create a goal with default (weekly) cadence.
  await page.goto('/app/goals/new')
  await page.getByLabel('Title').fill('Cadence test goal')
  await page.getByLabel('Keywords').fill('attention sinks')
  await page.getByRole('button', { name: /create goal/i }).click()
  await expect(page).toHaveURL(/\/app\/goals\/[^/]+$/)

  // Default is weekly — the chip should reflect that.
  await expect(page.getByTestId('cadence-chip')).toContainText(/weekly/i)
  await expect(page.getByTestId('next-run-chip')).toContainText(/next run/i)

  // Switch the cadence to on_demand and verify the chip updates.
  await page.locator('select[name="cadence"]').selectOption('on_demand')
  await page.getByRole('button', { name: 'Save goal', exact: true }).click()
  await expect(page).toHaveURL(/saved=1/)

  await expect(page.getByTestId('cadence-chip')).toContainText(/on_demand/i)
  await expect(page.getByTestId('next-run-chip')).toContainText(/on demand/i)
})
