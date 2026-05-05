import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { emails, users, type User } from '@/db/schema'
import { sendViaMailgun, MailgunError } from './mailgun'

export interface QueueDigestInput {
  userId: string
  subject: string
  html: string
  text: string
  briefingIds: string[]
}

export interface SendResult {
  emailId: string
  status: 'sent' | 'suppressed' | 'failed'
  mailgunId?: string
  reason?: string
}

/**
 * Records the outbound email row, then dispatches via Mailgun. Honors per-user
 * suppression. Caller is responsible for idempotency / debouncing upstream.
 */
export async function sendDigest(
  input: QueueDigestInput,
): Promise<SendResult> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, input.userId))
  if (!user) {
    throw new Error(`user ${input.userId} not found`)
  }
  if (!user.email) {
    throw new Error(`user ${input.userId} has no email on file`)
  }

  if (user.emailSuppressed) {
    const [row] = await db
      .insert(emails)
      .values({
        userId: input.userId,
        kind: 'digest',
        subject: input.subject,
        status: 'failed',
        briefingIdsJson: input.briefingIds,
      })
      .returning()
    return {
      emailId: row.id,
      status: 'suppressed',
      reason: `User suppressed: ${user.emailSuppressed}`,
    }
  }

  const [row] = await db
    .insert(emails)
    .values({
      userId: input.userId,
      kind: 'digest',
      subject: input.subject,
      status: 'queued',
      briefingIdsJson: input.briefingIds,
    })
    .returning()

  try {
    const result = await sendViaMailgun({
      to: user.email,
      subject: input.subject,
      html: input.html,
      text: input.text,
      headers: { 'X-Valency-Email-Id': row.id },
      idempotencyKey: row.id,
      tags: ['digest'],
    })
    await db
      .update(emails)
      .set({
        status: 'sent',
        mailgunId: result.id,
        sentAt: new Date(),
      })
      .where(eq(emails.id, row.id))
    return { emailId: row.id, status: 'sent', mailgunId: result.id }
  } catch (err) {
    const reason = err instanceof MailgunError ? err.message : String(err)
    await db
      .update(emails)
      .set({ status: 'failed' })
      .where(eq(emails.id, row.id))
    return { emailId: row.id, status: 'failed', reason }
  }
}

/** Convenience for tests / callers that don't need the User row. */
export async function userIsAcceptingEmail(user: Pick<User, 'emailSuppressed' | 'emailDigestCadence' | 'email'>): Promise<boolean> {
  if (!user.email) return false
  if (user.emailSuppressed) return false
  if (user.emailDigestCadence === 'off') return false
  return true
}
