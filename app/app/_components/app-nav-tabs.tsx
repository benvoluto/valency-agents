'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BookOpen,
  Graph,
  Newspaper,
  type Icon,
} from '@phosphor-icons/react'

interface Tab {
  href: string
  label: string
  shortLabel: string
  icon: Icon
}

const TABS: Tab[] = [
  { href: '/app', label: "Today's Briefing", shortLabel: 'Today', icon: Newspaper },
  { href: '/app/topics', label: 'Topics', shortLabel: 'Topics', icon: Graph },
  { href: '/app/library', label: 'Library', shortLabel: 'Library', icon: BookOpen },
]

export function AppNavTabs() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Primary"
      className="flex items-center gap-1"
    >
      {TABS.map((tab) => {
        const active =
          tab.href === '/app'
            ? pathname === '/app'
            : pathname.startsWith(tab.href)
        const Icon = tab.icon
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            data-active={active}
            className="text-accent hover:bg-surface/60 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 data-[active=true]:bg-surface data-[active=true]:shadow-sm flex items-center gap-2 rounded-full px-3 py-2 text-sm transition-colors sm:px-4"
          >
            <Icon size={18} weight="regular" aria-hidden />
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.shortLabel}</span>
          </Link>
        )
      })}
    </nav>
  )
}
