'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { List, X } from '@phosphor-icons/react'

export function AppNavLinks({
  items,
}: {
  items: { href: string; label: string }[]
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // ESC closes the drawer
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-ink hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 inline-flex h-11 w-11 items-center justify-center rounded-md md:hidden"
        aria-label="Open navigation menu"
        aria-expanded={open}
      >
        <List size={20} weight="regular" aria-hidden />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className="motion-safe:animate-fadeIn fixed inset-0 z-50 flex justify-end md:hidden"
        >
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/30"
          />
          <nav
            aria-label="Primary"
            className="bg-surface relative flex h-full w-72 max-w-full flex-col overflow-y-auto border-l border-border-subtle p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <p className="text-ink-muted font-mono text-[11px] tracking-wider uppercase">
                Menu
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 inline-flex h-11 w-11 items-center justify-center rounded-md"
              >
                <X size={18} weight="bold" aria-hidden />
              </button>
            </div>
            <ul className="mt-6 space-y-1">
              {items.map((item) => {
                const active =
                  item.href === '/app'
                    ? pathname === '/app'
                    : pathname.startsWith(item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setOpen(false)}
                      className="text-ink hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 data-[active=true]:bg-accent-soft data-[active=true]:text-accent flex items-center justify-between rounded-md px-3 py-3 text-base"
                      data-active={active}
                    >
                      <span>{item.label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
        </div>
      ) : null}
    </>
  )
}
