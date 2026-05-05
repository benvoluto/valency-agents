import AxeBuilder from '@axe-core/playwright'
import { devices, expect, test } from '@playwright/test'
import { loginAs, randomEmail, seedBriefings } from './_helpers/login'

// Use iPhone 14 viewport (390×844) but stay on chromium so CI doesn't need
// a separate browser binary. We avoid `isMobile` because chromium errors on
// it ("isMobile is not implemented") — the viewport size alone is enough to
// trigger our `md:hidden` / `md:flex` CSS breakpoints (md = 768px).
void devices
test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
})

async function runAxe(page: import('@playwright/test').Page, label: string) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  const serious = result.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  )
  if (serious.length > 0) {
    const summary = serious
      .map((v) => `${v.impact}: ${v.id} (${v.nodes.length} nodes) — ${v.help}`)
      .join('\n')
    throw new Error(`axe-core violations on ${label}:\n${summary}`)
  }
}

test('home + briefing detail render cleanly on iPhone 14', async ({
  page,
  context,
  request,
}) => {
  const email = randomEmail('mob')
  await loginAs(request, context, email, 'Mobile Tester', {
    completeOnboarding: true,
  })
  await seedBriefings(request, email)

  await page.goto('/app')
  await runAxe(page, 'home (mobile)')

  await page
    .getByRole('link', { name: /A v2 challenges the premise/ })
    .first()
    .click()
  await page.waitForURL(/\/app\/briefings\/[^/]+/)
  await runAxe(page, 'briefing detail (mobile)')
})

test('hamburger drawer opens, exposes nav, closes on ESC', async ({
  page,
  context,
  request,
}) => {
  await loginAs(request, context, randomEmail('nav'), 'Nav Tester', {
    completeOnboarding: true,
  })
  await page.goto('/app')

  await page.getByRole('button', { name: /open navigation menu/i }).click()
  const dialog = page.getByRole('dialog', { name: /navigation/i })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('link', { name: /Goals/ })).toBeVisible()
  await expect(dialog.getByRole('link', { name: /Library/ })).toBeVisible()
  await expect(dialog.getByRole('link', { name: /Settings/ })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})
