/**
 * Client-side Sentry init. Auto-loaded by Next 16 when present at the repo
 * root. No-op without SENTRY_DSN.
 */
import * as Sentry from '@sentry/nextjs'

if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    replaysOnErrorSampleRate: 0,
    replaysSessionSampleRate: 0,
  })
}
