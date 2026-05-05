import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { emails, emailEvents, users } from '@/db/schema'
import { verifyMailgunSignature } from '@/lib/email/mailgun'

interface MailgunEventPayload {
  signature?: { token: string; timestamp: string; signature: string }
  'event-data'?: {
    event?: string
    id?: string
    timestamp?: number
    recipient?: string
    'user-variables'?: Record<string, unknown>
    message?: { headers?: { 'message-id'?: string } }
  }
}

const EVENT_KIND_MAP: Record<
  string,
  'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'unsubscribed' | 'failed'
> = {
  delivered: 'delivered',
  opened: 'opened',
  clicked: 'clicked',
  failed: 'failed',
  bounced: 'bounced',
  complained: 'complained',
  unsubscribed: 'unsubscribed',
  // Mailgun also sends 'rejected' for permanently failed; map to bounced.
  rejected: 'bounced',
}

const STATUS_MAP: Partial<
  Record<string, 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'failed'>
> = {
  delivered: 'delivered',
  opened: 'opened',
  clicked: 'clicked',
  bounced: 'bounced',
  rejected: 'bounced',
  complained: 'complained',
  failed: 'failed',
}

const SUPPRESSING_EVENTS = new Set(['bounced', 'rejected', 'complained', 'unsubscribed'])

export async function POST(req: Request) {
  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY
  if (!signingKey) {
    return Response.json({ error: 'webhook not configured' }, { status: 503 })
  }

  let payload: MailgunEventPayload
  try {
    payload = (await req.json()) as MailgunEventPayload
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 })
  }

  if (
    !payload.signature ||
    !(await verifyMailgunSignature(payload.signature, signingKey))
  ) {
    return Response.json({ error: 'bad signature' }, { status: 401 })
  }

  const data = payload['event-data']
  if (!data?.event) {
    return Response.json({ error: 'missing event' }, { status: 400 })
  }

  const kind = EVENT_KIND_MAP[data.event]
  if (!kind) {
    // Unknown event type — accept and ignore (Mailgun keeps adding new ones).
    return Response.json({ ok: true, ignored: data.event })
  }

  const mailgunId = data.message?.headers?.['message-id'] ?? data.id ?? null

  // Find the email row by mailgunId or by header variable.
  let emailRow: { id: string; userId: string } | null = null
  if (mailgunId) {
    const [r] = await db
      .select({ id: emails.id, userId: emails.userId })
      .from(emails)
      .where(eq(emails.mailgunId, mailgunId))
      .limit(1)
    emailRow = r ?? null
  }
  if (!emailRow) {
    const idempotencyKey = data['user-variables']?.idempotencyKey
    if (typeof idempotencyKey === 'string') {
      const [r] = await db
        .select({ id: emails.id, userId: emails.userId })
        .from(emails)
        .where(eq(emails.id, idempotencyKey))
        .limit(1)
      emailRow = r ?? null
    }
  }

  await db.insert(emailEvents).values({
    emailId: emailRow?.id ?? null,
    mailgunId,
    kind,
    payloadJson: data as unknown as Record<string, unknown>,
  })

  if (emailRow) {
    const newStatus = STATUS_MAP[data.event]
    if (newStatus) {
      await db
        .update(emails)
        .set({ status: newStatus })
        .where(eq(emails.id, emailRow.id))
    }
  }

  if (
    SUPPRESSING_EVENTS.has(data.event) &&
    (emailRow?.userId || data.recipient)
  ) {
    if (emailRow?.userId) {
      await db
        .update(users)
        .set({ emailSuppressed: data.event })
        .where(eq(users.id, emailRow.userId))
    } else if (data.recipient) {
      await db
        .update(users)
        .set({ emailSuppressed: data.event })
        .where(eq(users.email, data.recipient))
    }
  }

  return Response.json({ ok: true })
}
