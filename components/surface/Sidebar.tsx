import type { User } from '@/db/schema'
import { AddressBook } from '@phosphor-icons/react/dist/ssr'
import { AskAnything } from './AskAnything'
import { QuickActions } from './QuickActions'
import { InProgressPanel } from './InProgressPanel'

export async function Sidebar({
  user,
  savedCount,
}: {
  user: User
  savedCount: number
}) {
  const facts: string[] = []
  if (user.affiliation) facts.push(user.affiliation)
  if (user.orcid) facts.push(`ORCID ${user.orcid}`)
  facts.push(`${savedCount} saved`)
  return (
    <aside className="space-y-6">
      <section className="text-ink-muted flex items-start gap-3 text-sm leading-snug">
        <AddressBook
          size={22}
          weight="regular"
          className="mt-0.5 shrink-0"
          aria-hidden
        />
        <p className="break-words">{facts.join(' · ')}</p>
      </section>

      <QuickActions />
      <AskAnything />
      <InProgressPanel userId={user.id} />
    </aside>
  )
}
