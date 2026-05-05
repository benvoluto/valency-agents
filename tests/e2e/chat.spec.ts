import { expect, test } from '@playwright/test'
import { loginAs, randomEmail } from './_helpers/login'

test('start a thread from /app/chat and land on the thread page', async ({
  page,
  context,
  request,
}) => {
  await loginAs(request, context, randomEmail('chat'), 'Chat Tester', {
    completeOnboarding: true,
  })

  await page.goto('/app/chat')
  await expect(
    page.getByRole('heading', { name: /ask the agents anything/i }),
  ).toBeVisible()

  await page
    .getByPlaceholder(/what new long-context papers/i)
    .fill('What just happened in attention-sinks research?')
  await page.getByRole('button', { name: /^Start$/ }).click()

  await expect(page).toHaveURL(/\/app\/chat\/[^/]+\?firstMessage=/)
  await expect(
    page.getByRole('heading', { name: /What just happened/ }),
  ).toBeVisible()

  // The user bubble for the firstMessage should be visible (auto-sent by the
  // client). The assistant bubble appears after a live LLM call — we don't
  // await it here so the test stays free of paid-API spend.
  await expect(
    page.getByTestId('user-message').first(),
  ).toBeVisible({ timeout: 5000 })
})

test('AskAnything redirect: /app/chat?q=… creates a thread inline', async ({
  page,
  context,
  request,
}) => {
  await loginAs(request, context, randomEmail('ask'), 'Ask Tester', {
    completeOnboarding: true,
  })

  await page.goto(
    '/app/chat?q=' + encodeURIComponent('cite my long-context paper'),
  )
  await expect(page).toHaveURL(/\/app\/chat\/[^/]+\?firstMessage=/)
  await expect(
    page.getByRole('heading', { name: /cite my long-context paper/ }),
  ).toBeVisible()
})

test('thread shows up in /app/chat list after creation', async ({
  page,
  context,
  request,
}) => {
  await loginAs(request, context, randomEmail('list'), 'List Tester', {
    completeOnboarding: true,
  })

  await page.goto('/app/chat')
  await page
    .getByPlaceholder(/what new long-context papers/i)
    .fill('Smoke test thread')
  await page.getByRole('button', { name: /^Start$/ }).click()
  await expect(page).toHaveURL(/\/app\/chat\/[^/]+/)

  await page.goto('/app/chat')
  await expect(page.getByRole('heading', { name: /Recent threads/ })).toBeVisible()
  await expect(
    page.getByRole('link', { name: /Smoke test thread/ }).first(),
  ).toBeVisible()
})
