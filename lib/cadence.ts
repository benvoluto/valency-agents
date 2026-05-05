import type { Goal, User } from '@/db/schema'

const POLL_INTERVAL_MS = 15 * 60 * 1000

/** Returns the user's local-time fields at `now` according to their timezone. */
export function localFields(timezone: string | null, now: Date) {
  const tz = timezone ?? 'UTC'
  // Intl.DateTimeFormat with timezone gives us the wall-clock fields directly.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(now).map((p) => [p.type, p.value]),
  ) as Record<string, string>
  // weekday short: 'Mon' 'Tue' ... — map to 1..7 (Mon=1, Sun=7) per ISO.
  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === '24' ? '0' : parts.hour),
    minute: Number(parts.minute),
    weekday: weekdayMap[parts.weekday] ?? 1,
    tz,
  }
}

/**
 * Returns true when the goal is due for a pipeline run as of `now`. The cron
 * fires every 15 min, so daily/weekly goals "fire" if they fall within the
 * 06:00–06:14 user-local window AND haven't been briefed since their last
 * scheduled trigger.
 */
export function isGoalDue(
  goal: Pick<Goal, 'cadence' | 'lastBriefedAt' | 'status'>,
  user: Pick<User, 'timezone'>,
  now: Date,
): boolean {
  if (goal.status !== 'active') return false
  switch (goal.cadence) {
    case 'on_demand':
      return false
    case 'continuous':
      if (!goal.lastBriefedAt) return true
      return now.getTime() - goal.lastBriefedAt.getTime() >= POLL_INTERVAL_MS
    case 'daily': {
      const local = localFields(user.timezone, now)
      const inWindow = local.hour === 6 && local.minute < 15
      if (!inWindow) return false
      return notRunSinceLocalTime(goal.lastBriefedAt, user.timezone, {
        year: local.year,
        month: local.month,
        day: local.day,
        hour: 6,
        minute: 0,
      })
    }
    case 'weekly': {
      const local = localFields(user.timezone, now)
      const isMonday = local.weekday === 1
      const inWindow = isMonday && local.hour === 6 && local.minute < 15
      if (!inWindow) return false
      return notRunSinceLocalTime(goal.lastBriefedAt, user.timezone, {
        year: local.year,
        month: local.month,
        day: local.day,
        hour: 6,
        minute: 0,
      })
    }
    default:
      return false
  }
}

/**
 * Returns the next scheduled run time as a UTC Date. For on_demand returns
 * null. For continuous returns lastBriefedAt + 15min (or now). For daily /
 * weekly, returns the next 06:00 local-time boundary.
 */
export function nextRunAt(
  goal: Pick<Goal, 'cadence' | 'lastBriefedAt' | 'status'>,
  user: Pick<User, 'timezone'>,
  now: Date,
): Date | null {
  if (goal.status !== 'active') return null
  switch (goal.cadence) {
    case 'on_demand':
      return null
    case 'continuous': {
      const last = goal.lastBriefedAt?.getTime() ?? 0
      return new Date(Math.max(now.getTime(), last + POLL_INTERVAL_MS))
    }
    case 'daily':
      return nextLocalTime(user.timezone, now, { hour: 6, minute: 0 })
    case 'weekly':
      return nextLocalTime(user.timezone, now, {
        hour: 6,
        minute: 0,
        weekday: 1,
      })
    default:
      return null
  }
}

function notRunSinceLocalTime(
  lastBriefedAt: Date | null,
  timezone: string | null,
  target: { year: number; month: number; day: number; hour: number; minute: number },
): boolean {
  if (!lastBriefedAt) return true
  const targetUtc = utcFromLocal(timezone ?? 'UTC', target)
  return lastBriefedAt.getTime() < targetUtc.getTime()
}

interface LocalTime {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

/** Approximate UTC instant for a given local-time spec in `tz`. */
function utcFromLocal(
  tz: string,
  t: LocalTime,
): Date {
  // Iterate: pick a UTC candidate, see what local time it produces, adjust.
  // Two passes converge for any sane timezone (DST edges included).
  let candidate = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute)
  for (let i = 0; i < 2; i++) {
    const local = localFields(tz, new Date(candidate))
    const localMs = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
    )
    const wantMs = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute)
    candidate += wantMs - localMs
  }
  return new Date(candidate)
}

function nextLocalTime(
  timezone: string | null,
  now: Date,
  target: { hour: number; minute: number; weekday?: number },
): Date {
  const tz = timezone ?? 'UTC'
  const local = localFields(tz, now)
  let candidateLocal = {
    year: local.year,
    month: local.month,
    day: local.day,
    hour: target.hour,
    minute: target.minute,
  }
  let candidate = utcFromLocal(tz, candidateLocal)
  if (candidate.getTime() <= now.getTime()) {
    // Push forward by one day.
    const tomorrow = new Date(candidate.getTime() + 24 * 60 * 60 * 1000)
    const tlocal = localFields(tz, tomorrow)
    candidateLocal = {
      year: tlocal.year,
      month: tlocal.month,
      day: tlocal.day,
      hour: target.hour,
      minute: target.minute,
    }
    candidate = utcFromLocal(tz, candidateLocal)
  }
  if (target.weekday !== undefined) {
    // Roll forward day-by-day until weekday matches.
    while (localFields(tz, candidate).weekday !== target.weekday) {
      candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000)
      const c = localFields(tz, candidate)
      candidate = utcFromLocal(tz, {
        year: c.year,
        month: c.month,
        day: c.day,
        hour: target.hour,
        minute: target.minute,
      })
    }
  }
  return candidate
}
