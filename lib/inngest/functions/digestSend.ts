import { and, eq, gt, inArray, isNotNull, isNull, or } from 'drizzle-orm'
import { db } from '@/db'
import {
  briefings,
  emails,
  goals,
  users,
  type Briefing,
} from '@/db/schema'
import { renderDigest, type DigestBriefing } from '@/lib/email/digest'
import { sendDigest, userIsAcceptingEmail } from '@/lib/email/send'
import { inngest } from '../client'

/**
 * Listens to `briefing.created` and debounces per user. After the debounce
 * window closes (10 min idle), fires a `digest.send.requested` event.
 */
export const debounceBriefingCreated = inngest.createFunction(
  {
    id: 'debounce-briefing-created',
    name: 'Debounce briefings into a digest',
    triggers: [{ event: 'briefing.created' }],
    debounce: { period: '10m', key: 'event.data.userId' },
    retries: 0,
  },
  async ({ event, step }) => {
    const userId = event.data.userId as string
    await step.sendEvent('schedule digest', {
      name: 'digest.send.requested',
      data: { userId },
    })
    return { userId }
  },
)

/**
 * Renders + sends the digest for one user. Loads pending briefings the user
 * hasn't been digested on yet (briefings with createdAt > most recent digest
 * email's sentAt). Honors email prefs + suppression.
 */
export const sendDigestEmail = inngest.createFunction(
  {
    id: 'send-digest-email',
    name: 'Send digest email',
    triggers: [{ event: 'digest.send.requested' }],
    concurrency: { limit: 1, key: 'event.data.userId' },
    retries: 1,
  },
  async ({ event, step }) => {
    const userId = event.data.userId as string

    const result = await step.run('render and send', async () => {
      const [user] = await db.select().from(users).where(eq(users.id, userId))
      if (!user) {
        return { skipped: 'user_not_found' }
      }
      if (!(await userIsAcceptingEmail(user))) {
        return { skipped: 'cadence_off_or_suppressed' }
      }

      // Find briefings from this user that haven't been digested yet —
      // those whose createdAt is greater than the most recent digest's
      // sentAt (or all of them, if no digest has been sent).
      const [lastDigest] = await db
        .select({ sentAt: emails.sentAt })
        .from(emails)
        .where(
          and(
            eq(emails.userId, userId),
            eq(emails.kind, 'digest'),
            eq(emails.status, 'sent'),
            isNotNull(emails.sentAt),
          ),
        )
        .orderBy(emails.sentAt)
        .limit(1)

      const pending: Briefing[] = await db
        .select()
        .from(briefings)
        .where(
          and(
            eq(briefings.userId, userId),
            eq(briefings.status, 'pending'),
            lastDigest?.sentAt
              ? gt(briefings.createdAt, lastDigest.sentAt)
              : or(isNull(briefings.createdAt), isNotNull(briefings.createdAt)),
          ),
        )

      if (pending.length === 0) {
        return { skipped: 'no_pending_briefings' }
      }

      const goalIds = Array.from(
        new Set(pending.map((b) => b.goalId).filter((g): g is string => !!g)),
      )
      const goalRows =
        goalIds.length > 0
          ? await db
              .select({ id: goals.id, title: goals.title })
              .from(goals)
              .where(inArray(goals.id, goalIds))
          : []
      const goalTitleById = new Map(goalRows.map((g) => [g.id, g.title]))

      const digestBriefings: DigestBriefing[] = pending.map((b) => ({
        briefing: b,
        goalTitle: b.goalId ? (goalTitleById.get(b.goalId) ?? null) : null,
      }))

      const appBaseUrl =
        process.env.AUTH_URL ?? 'https://researchagents.io'
      const replyAddress =
        process.env.MAILGUN_FROM_EMAIL?.match(/<([^>]+)>/)?.[1] ??
        process.env.MAILGUN_FROM_EMAIL ??
        'please-reply@researchagents.io'
      const subject = `Research Agents · ${pending.length} for you · ${new Date().toISOString().slice(0, 10)}`

      const { html, text } = await renderDigest({
        recipientName: user.name ?? 'researcher',
        appBaseUrl,
        briefings: digestBriefings,
        unsubscribeUrl: `${appBaseUrl}/app/settings?unsubscribe=1`,
        preferencesUrl: `${appBaseUrl}/app/settings`,
        replyAddress,
      })

      const send = await sendDigest({
        userId,
        subject,
        html,
        text,
        briefingIds: pending.map((b) => b.id),
      })
      return { ...send, briefingCount: pending.length }
    })

    return result
  },
)
