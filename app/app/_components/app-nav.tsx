import Link from 'next/link'
import { signOut } from '@/auth'
import type { User } from '@/db/schema'

export function AppNav({ user }: { user: User }) {
  const initial = (user.name ?? user.email ?? '?').slice(0, 1).toUpperCase()
  return (
    <header className="border-border-subtle border-b">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-4">
        <Link
          href="/app"
          className="text-ink-muted font-mono text-xs tracking-wider uppercase"
        >
          researchagents.io
        </Link>
        <nav className="text-ink-muted flex items-center gap-5 text-sm">
          <Link href="/app" className="hover:text-ink">
            Briefings
          </Link>
          <Link href="/app/goals" className="hover:text-ink">
            Goals
          </Link>
          <Link href="/app/library" className="hover:text-ink">
            Library
          </Link>
          <Link href="/app/settings" className="hover:text-ink">
            Settings
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <div className="bg-accent-soft text-accent flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium">
            {initial}
          </div>
          <form
            action={async () => {
              'use server'
              await signOut({ redirectTo: '/' })
            }}
          >
            <button
              type="submit"
              className="text-ink-muted hover:text-ink text-xs"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
