import { auth } from '@/auth'
import {
  ActionError,
  applyAction,
  type ActionKind,
  type ActionSource,
} from '@/lib/actions/apply'

const VALID_KINDS: ActionKind[] = [
  'approve',
  'dismiss',
  'save',
  'more_like_this',
  'snooze',
  'open',
  'undo',
]

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const { id: briefingId } = await ctx.params
  let body: {
    kind?: string
    idempotencyKey?: string
    source?: string
    details?: Record<string, unknown>
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid json body' }, { status: 400 })
  }

  if (!body.kind || !VALID_KINDS.includes(body.kind as ActionKind)) {
    return Response.json(
      { error: `kind must be one of ${VALID_KINDS.join(', ')}` },
      { status: 400 },
    )
  }
  if (!body.idempotencyKey || body.idempotencyKey.length < 8) {
    return Response.json(
      { error: 'idempotencyKey required (min 8 chars)' },
      { status: 400 },
    )
  }

  const source: ActionSource =
    body.source === 'email' || body.source === 'voice' ? body.source : 'web'

  try {
    const result = await applyAction({
      userId: session.user.id,
      briefingId,
      kind: body.kind as ActionKind,
      details: body.details,
      idempotencyKey: body.idempotencyKey,
      source,
    })
    return Response.json({
      ok: true,
      action: result.action,
      summary: result.summary,
      derivedGoalId: result.derivedGoalId,
    })
  } catch (err) {
    if (err instanceof ActionError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    console.error('action failed', err)
    return Response.json({ error: 'internal error' }, { status: 500 })
  }
}
