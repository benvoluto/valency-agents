import { Inngest } from 'inngest'

/** Strongly-typed event payloads. Mirrored to a typed `sendEvent` helper. */
export type GoalRunRequested = {
  name: 'goal.run.requested'
  data: {
    userId: string
    goalId: string
    reason: 'cron' | 'manual' | 'goal_created' | 'goal_updated'
  }
}

export type SignalPollTick = {
  name: 'signal.poll.tick'
  data: Record<string, never>
}

export type BriefingCreated = {
  name: 'briefing.created'
  data: { userId: string; briefingId: string; goalId: string | null }
}

export type DigestSendRequested = {
  name: 'digest.send.requested'
  data: { userId: string }
}

export type AppEvent =
  | GoalRunRequested
  | SignalPollTick
  | BriefingCreated
  | DigestSendRequested

export const inngest = new Inngest({
  id: 'valency-agents',
  // The signing key is read from INNGEST_SIGNING_KEY automatically; the event
  // key from INNGEST_EVENT_KEY.
})

/**
 * Typed wrapper around `inngest.send`. In environments without
 * `INNGEST_EVENT_KEY` set (typical for local dev when you haven't wired
 * Inngest), this no-ops and returns an empty `ids` array rather than
 * throwing — the Inngest SDK otherwise rejects every send loudly.
 */
export async function sendEvent(event: AppEvent): Promise<{ ids: string[] }> {
  if (!process.env.INNGEST_EVENT_KEY) {
    if (process.env.NODE_ENV !== 'production') {
      console.info(
        JSON.stringify({
          tag: 'inngest.send.skipped',
          event: event.name,
          reason: 'INNGEST_EVENT_KEY not set',
        }),
      )
    }
    return { ids: [] }
  }
  return inngest.send(event)
}
