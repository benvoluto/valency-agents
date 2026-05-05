import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { briefings, users } from '@/db/schema'
import { verifyMailgunSignature } from '@/lib/email/mailgun'
import { parseInboundIntent } from '@/lib/email/inbound'
import { sendBounceReply, sendConfirmationReply } from '@/lib/email/replies'
import {
  ActionError,
  applyAction,
  type ActionKind,
} from '@/lib/actions/apply'
import { rateLimit } from '@/lib/rate-limit'

const KIND_MAP: Record<string, ActionKind> = {
  approve: 'approve',
  dismiss: 'dismiss',
  more: 'more_like_this',
  snooze: 'snooze',
}

/**
 * Mailgun "Store and notify" / forward webhook for inbound mail. Mailgun POSTs
 * multipart/form-data with sender, recipient, subject, body-plain, plus a
 * signature triple (token/timestamp/signature). We verify HMAC, allow-list
 * the sender against `users.email`, parse one-line intent, and apply the
 * action with `source: 'email'`.
 *
 * Returns 200 in nearly all branches so Mailgun doesn't retry. The only
 * non-2xx case is bad HMAC.
 */
export async function POST(req: Request) {
  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY
  if (!signingKey) {
    return Response.json({ error: 'webhook not configured' }, { status: 503 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return Response.json({ error: 'invalid form-data' }, { status: 400 })
  }

  const token = String(form.get('token') ?? '')
  const timestamp = String(form.get('timestamp') ?? '')
  const signature = String(form.get('signature') ?? '')
  const ok = await verifyMailgunSignature(
    { token, timestamp, signature },
    signingKey,
  )
  if (!ok) {
    return Response.json({ error: 'bad signature' }, { status: 401 })
  }

  const sender = String(form.get('sender') ?? form.get('from') ?? '')
    .replace(/.*<([^>]+)>.*/, '$1')
    .trim()
    .toLowerCase()
  const subject = String(form.get('subject') ?? '(no subject)')
  const bodyPlain = String(form.get('body-plain') ?? '')
  const messageId = String(form.get('Message-Id') ?? form.get('message-id') ?? '')

  if (!sender) {
    return Response.json({ ok: true, ignored: 'no sender' })
  }

  const limited = rateLimit('inbound', sender)
  if (limited) return limited

  // Allowlist by exact users.email match.
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, sender))
    .limit(1)

  if (!user) {
    await sendBounceReply({ to: sender, subject }).catch(() => {})
    return Response.json({ ok: true, action: 'bounced_unknown_sender' })
  }

  const intent = await parseInboundIntent(bodyPlain)
  if (!intent.kind || !intent.shortId) {
    return Response.json({ ok: true, action: 'no_intent' })
  }

  // Resolve the briefing by shortId scoped to this user.
  const [briefing] = await db
    .select()
    .from(briefings)
    .where(eq(briefings.shortId, intent.shortId))
    .limit(1)
  if (!briefing || briefing.userId !== user.id) {
    return Response.json({ ok: true, action: 'briefing_not_found' })
  }

  const actionKind = KIND_MAP[intent.kind]
  if (!actionKind) {
    return Response.json({ ok: true, action: 'unknown_kind' })
  }

  const idempotencyKey = `email:${messageId || `${user.id}:${briefing.id}:${intent.kind}`}`

  try {
    const result = await applyAction({
      userId: user.id,
      briefingId: briefing.id,
      kind: actionKind,
      idempotencyKey,
      source: 'email',
    })

    const baseUrl = process.env.AUTH_URL ?? 'https://researchagents.io'
    await sendConfirmationReply({
      to: sender,
      subject,
      summary: result.summary,
      link: `${baseUrl}/app/briefings/${briefing.id}`,
    }).catch(() => {})

    return Response.json({
      ok: true,
      action: actionKind,
      briefingId: briefing.id,
      summary: result.summary,
    })
  } catch (err) {
    if (err instanceof ActionError) {
      return Response.json(
        { ok: true, action: 'failed', reason: err.message },
        { status: 200 },
      )
    }
    console.error('inbound action failed', err)
    return Response.json({ ok: true, action: 'error' })
  }
}
