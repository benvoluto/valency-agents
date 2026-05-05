import Link from 'next/link'
import { ArrowRight } from '@phosphor-icons/react/dist/ssr'

const ACTIONS = [
  { href: '/app/goals/new', label: 'New goal' },
  { href: '/app/settings', label: 'Pause briefings' },
  { href: '/app/library', label: 'Library' },
  { href: '/app/topics', label: 'Topics' },
  { href: '/app/settings', label: 'Settings' },
]

export function QuickActions() {
  return (
    <section className="bg-surface border-border-subtle rounded-2xl border p-5">
      <h2 className="text-ink-muted font-mono text-[11px] tracking-wider uppercase">
        Quick actions
      </h2>
      <ul className="mt-3 space-y-1.5 text-sm">
        {ACTIONS.map((a) => (
          <li key={a.label}>
            <Link
              href={a.href}
              className="text-ink hover:text-accent group flex items-center justify-between py-1"
            >
              <span>{a.label}</span>
              <ArrowRight
                size={14}
                weight="regular"
                className="text-ink-muted group-hover:text-accent transition"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
