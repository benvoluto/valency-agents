import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from '@phosphor-icons/react/dist/ssr'
import { and, asc, eq } from 'drizzle-orm'
import { requireOnboardedUser } from '@/lib/auth-helpers'
import { db } from '@/db'
import { messages, threads } from '@/db/schema'
import { ThreadView } from './ThreadView'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ threadId: string }>
  searchParams: Promise<{ firstMessage?: string }>
}

export default async function ThreadPage({ params, searchParams }: RouteParams) {
  const user = await requireOnboardedUser()
  const { threadId } = await params
  const { firstMessage } = await searchParams

  const [thread] = await db
    .select()
    .from(threads)
    .where(and(eq(threads.id, threadId), eq(threads.userId, user.id)))
    .limit(1)
  if (!thread) notFound()

  const priorMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(asc(messages.createdAt))

  return (
    <>
      <header className="mb-6">
        <Link
          href="/app/chat"
          className="text-ink-muted font-mono text-xs tracking-wider uppercase hover:underline inline-flex items-center gap-1"
        >
          <ArrowLeft size={12} weight="regular" aria-hidden />
          all threads
        </Link>
        <h1 className="font-display text-ink mt-2 text-2xl leading-tight">
          {thread.title}
        </h1>
        <p className="text-ink-muted mt-1 font-mono text-[10px]">
          ${thread.costUsd.toFixed(4)} · {thread.tokensIn + thread.tokensOut} tokens
        </p>
      </header>

      <ThreadView
        threadId={thread.id}
        initialMessages={priorMessages.map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant' | 'tool' | 'system',
          contentJson: m.contentJson as unknown[],
          createdAt: m.createdAt.toISOString(),
        }))}
        autoSend={firstMessage ?? null}
      />
    </>
  )
}
