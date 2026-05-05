import Link from 'next/link'
import { requireUser } from '@/lib/auth-helpers'

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireUser()
  return (
    <main className="bg-bg min-h-screen px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <header className="mb-10">
          <Link
            href="/"
            className="text-ink-muted font-mono text-xs tracking-wider uppercase"
          >
            researchagents.io
          </Link>
          <h1 className="font-display text-ink mt-3 text-3xl">
            Welcome — let&apos;s get you set up.
          </h1>
        </header>
        {children}
      </div>
    </main>
  )
}
