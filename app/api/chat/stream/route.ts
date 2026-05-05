import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eventsToSse, runChatTurn } from '@/lib/chat/stream'
import { assertWithinBudget, BudgetExceededError } from '@/lib/agents/runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const userId = session.user.id

  let body: { threadId?: string; message?: string }
  try {
    body = (await req.json()) as { threadId?: string; message?: string }
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 })
  }
  if (!body.threadId || !body.message?.trim()) {
    return Response.json(
      { error: 'threadId and message required' },
      { status: 400 },
    )
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId))
  if (!user) {
    return Response.json({ error: 'user not found' }, { status: 404 })
  }

  // Per-user daily ceiling — hard kill at 2× budget.
  try {
    await assertWithinBudget(user.id, user.dailyBudgetUsd, 2)
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return Response.json({ error: err.message }, { status: 429 })
    }
    throw err
  }

  const stream = eventsToSse(
    runChatTurn({
      user,
      threadId: body.threadId,
      userMessage: body.message,
    }),
  )

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
