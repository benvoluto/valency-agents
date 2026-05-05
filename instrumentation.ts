/**
 * Next.js instrumentation entry. We initialize Sentry here so it captures
 * server-side errors. The client SDK is loaded separately via
 * `instrumentation-client.ts` (auto-discovered by Next 16).
 *
 * Sentry only initializes when SENTRY_DSN is set in the env. Without it,
 * everything below is a no-op.
 */
export async function register() {
  if (!process.env.SENTRY_DSN) return
  const Sentry = await import('@sentry/nextjs')
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.VERCEL_ENV ?? 'development',
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
      beforeSend(event) {
        // Strip headers that might carry tokens.
        if (event.request?.headers) {
          const h = event.request.headers as Record<string, string>
          delete h.cookie
          delete h.authorization
        }
        return event
      },
    })
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.VERCEL_ENV ?? 'development',
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
    })
  }
}

export const onRequestError = async (
  ...args: Parameters<
    NonNullable<typeof import('@sentry/nextjs').captureRequestError>
  >
) => {
  if (!process.env.SENTRY_DSN) return
  const Sentry = await import('@sentry/nextjs')
  Sentry.captureRequestError(...args)
}
