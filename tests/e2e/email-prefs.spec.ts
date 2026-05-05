import { expect, test } from '@playwright/test'
import { loginAs, randomEmail } from './_helpers/login'

test('email preferences: change cadence + persist on reload', async ({
  page,
  context,
  request,
}) => {
  await loginAs(request, context, randomEmail('email'), 'Email Tester', {
    completeOnboarding: true,
  })

  await page.goto('/app/settings')
  await expect(page.getByRole('heading', { name: /email preferences/i })).toBeVisible()

  // Default is daily; switch to weekly.
  await page.getByRole('radio', { name: /^weekly$/i }).check()
  await page.getByRole('button', { name: /save email preferences/i }).click()
  await expect(page).toHaveURL(/saved=email/)

  await page.reload()
  await expect(page.getByRole('radio', { name: /^weekly$/i })).toBeChecked()
})

test('quiet hours numeric inputs validate min/max', async ({
  page,
  context,
  request,
}) => {
  await loginAs(request, context, randomEmail('quiet'), 'Quiet Tester', {
    completeOnboarding: true,
  })
  await page.goto('/app/settings')
  const quietStart = page.locator('input[name="quietStart"]')
  await expect(quietStart).toHaveAttribute('min', '0')
  await expect(quietStart).toHaveAttribute('max', '23')
})
