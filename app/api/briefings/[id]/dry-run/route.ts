import { auth } from '@/auth'
import { ActionError, dryRunAction, type ActionKind } from '@/lib/actions/apply'

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

export async function GET(req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const { id: briefingId } = await ctx.params
  const url = new URL(req.url)
  const kind = url.searchParams.get('kind') as ActionKind | null
  if (!kind || !VALID_KINDS.includes(kind)) {
    return Response.json({ error: 'kind required' }, { status: 400 })
  }

  try {
    const preview = await dryRunAction({
      userId: session.user.id,
      briefingId,
      kind,
    })
    return Response.json(preview)
  } catch (err) {
    if (err instanceof ActionError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    return Response.json({ error: 'internal error' }, { status: 500 })
  }
}
