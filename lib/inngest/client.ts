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

export type AppEvent = GoalRunRequested | SignalPollTick | BriefingCreated

export const inngest = new Inngest({
  id: 'valency-agents',
  // The signing key is read from INNGEST_SIGNING_KEY automatically; the event
  // key from INNGEST_EVENT_KEY. In dev, the local Inngest CLI proxies events
  // without auth.
})

/** Typed wrapper around `inngest.send` so callers get autocomplete. */
export function sendEvent(event: AppEvent) {
  return inngest.send(event)
}
