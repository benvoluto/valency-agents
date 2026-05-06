import Link from 'next/link'
import { signOut } from '@/auth'
import { IdentificationBadge, UserCircle } from '@phosphor-icons/react/dist/ssr'
import type { User } from '@/db/schema'
import { AppNavTabs } from './app-nav-tabs'

export function AppNav({ user }: { user: User }) {
  const displayName = user.name ?? user.email ?? 'researcher'
  return (
    <header className="bg-bg-subtle">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4">
        <Link
          href="/app"
          className="flex min-w-0 items-center gap-3 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4 rounded-md"
        >
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <UserCircle
              size={40}
              weight="duotone"
              className="text-ink-muted shrink-0"
              aria-hidden
            />
          )}
          <span className="font-display text-ink truncate text-xl font-medium sm:text-2xl">
            {displayName}
          </span>
        </Link>

        <AppNavTabs />

        <div className="flex items-center gap-3">
          <Link
            href="/app"
            className="text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 hidden items-center gap-2 rounded-md text-sm sm:flex"
            aria-label="ResearchAgents home"
          >
            <IdentificationBadge size={20} weight="regular" aria-hidden />
            <span className="hidden md:inline">ResearchAgents</span>
          </Link>
          <form
            action={async () => {
              'use server'
              await signOut({ redirectTo: '/' })
            }}
          >
            <button
              type="submit"
              className="text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 rounded px-2 py-1 text-xs"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
