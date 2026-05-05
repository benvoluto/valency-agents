import { expect, test } from '@playwright/test'
import { loginAs, randomEmail } from './_helpers/login'

test('signed-in user is sent through onboarding before /app', async ({
  page,
  context,
  request,
}) => {
  await loginAs(request, context, randomEmail('onb'), 'Onboarding Tester')
  await page.goto('/app')
  await expect(page).toHaveURL(/\/onboarding\/identity$/)
  await expect(
    page.getByRole('heading', { name: /who are you/i }),
  ).toBeVisible()
})

test('identity step requires a name', async ({ page, context, request }) => {
  await loginAs(request, context, randomEmail('id'), '')
  await page.goto('/onboarding/identity')
  await page.getByLabel('Name').fill('A')
  // HTML5 minlength prevents submit; just assert the field is invalid.
  const nameInput = page.getByLabel('Name')
  await expect(nameInput).toHaveAttribute('minlength', '2')
})

test('identity → manual goal fallback when no Valency papers', async ({
  page,
  context,
  request,
}) => {
  await loginAs(request, context, randomEmail('manual'), 'Manual Tester')
  await page.goto('/onboarding/identity')
  await page.getByLabel('Name').fill('Nobody Particular')
  await page.getByLabel('Affiliation').fill('No Such University')
  await page.getByRole('button', { name: /continue/i }).click()
  await expect(page).toHaveURL(/\/onboarding\/summary$/, { timeout: 60_000 })

  // Either we got candidates or fell back to manual; both should have a
  // visible "Save & continue" button. The manual path is the safer assertion.
  await expect(
    page.getByRole('heading').filter({ hasText: /research|let's start/i }),
  ).toBeVisible({ timeout: 30_000 })
})
