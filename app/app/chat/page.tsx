import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, ChatCircleDots } from '@phosphor-icons/react/dist/ssr'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { requireOnboardedUser } from '@/lib/auth-helpers'
import { db } from '@/db'
import { threads } from '@/db/schema'

async function newThread(formData: FormData) {
  'use server'
  const user = await requireOnboardedUser()
  const firstMessage = formData.get('firstMessage')?.toString().trim() ?? ''
  const title = firstMessage
    ? truncate(firstMessage, 80)
    : 'New conversation'
  const [t] = await db
    .insert(threads)
    .values({ userId: user.id, title })
    .returning({ id: threads.id })
  if (firstMessage) {
    redirect(
      `/app/chat/${t.id}?firstMessage=${encodeURIComponent(firstMessage)}`,
    )
  }
  redirect(`/app/chat/${t.id}`)
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

export default async function ChatIndex({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const user = await requireOnboardedUser()
  const { q } = await searchParams

  // If someone arrives via /app/chat?q=… (from the home AskAnything), create
  // a thread immediately and bounce them into it with the prefilled message.
  if (q && q.trim()) {
    const trimmed = q.trim()
    const [t] = await db
      .insert(threads)
      .values({ userId: user.id, title: truncate(trimmed, 80) })
      .returning({ id: threads.id })
    redirect(
      `/app/chat/${t.id}?firstMessage=${encodeURIComponent(trimmed)}`,
    )
  }

  const userThreads = await db
    .select({
      id: threads.id,
      title: threads.title,
      lastMessageAt: threads.lastMessageAt,
      costUsd: threads.costUsd,
      tokensIn: threads.tokensIn,
      tokensOut: threads.tokensOut,
    })
    .from(threads)
    .where(and(eq(threads.userId, user.id), isNull(threads.archivedAt)))
    .orderBy(desc(threads.lastMessageAt))
    .limit(50)

  return (
    <>
      <header className="mb-8">
        <p className="text-ink-muted font-mono text-xs tracking-wider uppercase">
          chat
        </p>
        <h1 className="font-display text-ink mt-1 text-3xl">
          Ask the agents anything.
        </h1>
        <p className="text-ink-muted mt-2 text-sm leading-relaxed">
          The same agents that produce your daily briefings will answer
          follow-ups here. They can search arXiv, look at your saved
          briefings, and pull up your goals.
        </p>
      </header>

      <section className="bg-surface border-border-subtle mb-8 rounded-2xl border p-6">
        <form action={newThread} className="space-y-3">
          <label className="block">
            <span className="text-ink-muted font-mono text-[11px] tracking-wider uppercase">
              Start a thread
            </span>
            <input
              name="firstMessage"
              type="text"
              placeholder="e.g. what new long-context papers cite my work this week?"
              autoFocus
              className="border-border-subtle bg-surface text-ink mt-2 block w-full rounded-md border px-3 py-2 text-sm focus:outline-2 focus:outline-accent"
            />
          </label>
          <button
            type="submit"
            className="bg-ink text-surface hover:bg-ink/90 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition"
          >
            <ChatCircleDots size={14} weight="regular" aria-hidden />
            Start
          </button>
        </form>
      </section>

      {userThreads.length > 0 ? (
        <section>
          <h2 className="text-ink-muted font-mono text-[11px] tracking-wider uppercase">
            Recent threads ({userThreads.length})
          </h2>
          <ul className="mt-3 space-y-2">
            {userThreads.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/app/chat/${t.id}`}
                  className="bg-surface border-border-subtle hover:border-accent flex items-center justify-between gap-4 rounded-lg border px-4 py-3 transition"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-ink truncate text-sm font-medium">
                      {t.title}
                    </p>
                    <p className="text-ink-muted mt-1 font-mono text-[10px]">
                      {t.lastMessageAt.toISOString().slice(0, 16).replace('T', ' ')} ·{' '}
                      {t.tokensIn + t.tokensOut} tok · ${t.costUsd.toFixed(4)}
                    </p>
                  </div>
                  <ArrowRight size={14} weight="regular" aria-hidden className="text-ink-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-ink-muted text-sm italic">
          No threads yet. Type a question above to start one.
        </p>
      )}
    </>
  )
}
