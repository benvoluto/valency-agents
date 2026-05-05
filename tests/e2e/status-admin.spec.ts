import { expect, test } from '@playwright/test'
import { loginAs, randomEmail } from './_helpers/login'

test('/status renders the three components', async ({ page }) => {
  await page.goto('/status')
  await expect(
    page.getByRole('heading', { name: /Live status, last 24h/i }),
  ).toBeVisible()
  for (const id of ['db', 'anthropic', 'valency']) {
    await expect(page.getByTestId(`status-${id}`)).toBeVisible()
  }
})

test('/app/admin/spend redirects non-admins to /app', async ({
  page,
  context,
  request,
}) => {
  await loginAs(request, context, randomEmail('nadm'), 'Not Admin', {
    completeOnboarding: true,
  })
  await page.goto('/app/admin/spend')
  await expect(page).toHaveURL(/\/app$/)
})
