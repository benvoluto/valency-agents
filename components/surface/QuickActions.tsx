import Link from 'next/link'
import {
  Gear,
  Graph,
  Newspaper,
  Target,
} from '@phosphor-icons/react/dist/ssr'
import type { ComponentType } from 'react'

type IconComp = ComponentType<{
  size?: number
  weight?: 'regular' | 'bold' | 'fill'
}>

const ACTIONS: Array<{ href: string; label: string; icon: IconComp }> = [
  { href: '/app/goals/new', label: 'New Goal', icon: Target },
  { href: '/app', label: 'Briefings', icon: Newspaper },
  { href: '/app/topics', label: 'Browse Topics', icon: Graph },
  { href: '/app/settings', label: 'Settings', icon: Gear },
]

export function QuickActions() {
  return (
    <section aria-label="Quick actions">
      <ul className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        {ACTIONS.map((a) => {
          const Icon = a.icon
          return (
            <li key={a.label}>
              <Link
                href={a.href}
                className="text-accent hover:text-ink focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 inline-flex items-center gap-2 rounded-sm py-1 font-medium"
              >
                <Icon size={20} weight="regular" aria-hidden />
                {a.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
