import Link from 'next/link'
import { signOut } from '@/auth'
import type { User } from '@/db/schema'
import { AppNavLinks } from './app-nav-links'

const NAV_ITEMS = [
  { href: '/app', label: 'Briefings' },
  { href: '/app/goals', label: 'Goals' },
  { href: '/app/library', label: 'Library' },
  { href: '/app/topics', label: 'Topics' },
  { href: '/app/map', label: 'Map' },
  { href: '/app/settings', label: 'Settings' },
]

export function AppNav({ user }: { user: User }) {
  const initial = (user.name ?? user.email ?? '?').slice(0, 1).toUpperCase()
  return (
    <header className="border-border-subtle border-b">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:gap-6 sm:px-6 sm:py-4">
        <Link
          href="/app"
          className="text-ink-muted font-mono text-[11px] tracking-wider uppercase focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4 rounded-sm sm:text-xs"
        >
          researchagents.io
        </Link>

        <nav
          aria-label="Primary"
          className="text-ink-muted hidden items-center gap-5 text-sm md:flex"
        >
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="hover:text-ink focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 rounded px-1 py-1"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div
            aria-hidden
            className="bg-accent-soft text-accent flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium sm:h-7 sm:w-7"
          >
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
              className="text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 hidden rounded px-2 py-1 text-xs sm:inline"
            >
              Sign out
            </button>
          </form>

          <AppNavLinks items={NAV_ITEMS} />
        </div>
      </div>
    </header>
  )
}
