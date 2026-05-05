import AxeBuilder from '@axe-core/playwright'
import { test } from '@playwright/test'
import { loginAs, randomEmail, seedBriefings } from './_helpers/login'

const PAGES_TO_AUDIT = [
  { path: '/app', title: 'home' },
  { path: '/app/goals', title: 'goals list' },
  { path: '/app/library', title: 'library' },
  { path: '/app/topics', title: 'topics' },
  { path: '/app/settings', title: 'settings' },
  { path: '/app/chat', title: 'chat list' },
] as const

async function runAxe(page: import('@playwright/test').Page, label: string) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  const serious = result.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  )
  if (serious.length > 0) {
    const summary = serious
      .map((v) => {
        const nodes = v.nodes
          .slice(0, 3)
          .map(
            (n) =>
              `    target=${n.target.join(',')} ${n.failureSummary?.replace(/\n/g, ' ') ?? ''}`,
          )
          .join('\n')
        return `${v.impact}: ${v.id} (${v.nodes.length} nodes) — ${v.help}\n${nodes}`
      })
      .join('\n\n')
    throw new Error(`axe-core violations on ${label}:\n${summary}`)
  }
}

test('no serious axe-core violations on landing', async ({ page }) => {
  await page.goto('/')
  await runAxe(page, 'landing')
})

test('no serious axe-core violations across the signed-in app', async ({
  page,
  context,
  request,
}) => {
  const email = randomEmail('a11y')
  await loginAs(request, context, email, 'A11y Tester', {
    completeOnboarding: true,
  })
  await seedBriefings(request, email)

  for (const { path, title } of PAGES_TO_AUDIT) {
    await page.goto(path)
    await page.waitForLoadState('domcontentloaded')
    await runAxe(page, title)
  }
})
