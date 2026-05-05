import { describe, expect, it } from 'vitest'
import { isGoalDue, nextRunAt, localFields } from '@/lib/cadence'

const ACTIVE = 'active' as const

describe('localFields', () => {
  it('translates UTC into the user-local timezone', () => {
    // 2026-05-04T11:30:00Z = 2026-05-04 07:30 in America/New_York (EDT, -04)
    const f = localFields('America/New_York', new Date('2026-05-04T11:30:00Z'))
    expect(f.year).toBe(2026)
    expect(f.month).toBe(5)
    expect(f.day).toBe(4)
    expect(f.hour).toBe(7)
    expect(f.minute).toBe(30)
    expect(f.weekday).toBe(1) // Monday
  })
})

describe('isGoalDue (continuous)', () => {
  const goal = {
    cadence: 'continuous' as const,
    status: ACTIVE,
    lastBriefedAt: null as Date | null,
  }
  const user = { timezone: 'UTC' as string | null }

  it('first run is due immediately', () => {
    expect(isGoalDue(goal, user, new Date())).toBe(true)
  })
  it('not due 5 minutes after a run', () => {
    const last = new Date('2026-05-04T12:00:00Z')
    expect(
      isGoalDue(
        { ...goal, lastBriefedAt: last },
        user,
        new Date('2026-05-04T12:05:00Z'),
      ),
    ).toBe(false)
  })
  it('due 16 minutes after a run', () => {
    const last = new Date('2026-05-04T12:00:00Z')
    expect(
      isGoalDue(
        { ...goal, lastBriefedAt: last },
        user,
        new Date('2026-05-04T12:16:00Z'),
      ),
    ).toBe(true)
  })
})

describe('isGoalDue (daily)', () => {
  const goal = {
    cadence: 'daily' as const,
    status: ACTIVE,
    lastBriefedAt: null as Date | null,
  }

  it('fires inside the 06:00 user-local window', () => {
    // 06:05 in America/New_York during EDT = 10:05 UTC.
    const now = new Date('2026-05-04T10:05:00Z')
    expect(isGoalDue(goal, { timezone: 'America/New_York' }, now)).toBe(true)
  })
  it('does not fire outside the window', () => {
    const now = new Date('2026-05-04T15:00:00Z')
    expect(isGoalDue(goal, { timezone: 'America/New_York' }, now)).toBe(false)
  })
  it('does not fire twice the same day', () => {
    const last = new Date('2026-05-04T10:01:00Z') // already ran 06:01 NY
    const now = new Date('2026-05-04T10:14:00Z')
    expect(
      isGoalDue(
        { ...goal, lastBriefedAt: last },
        { timezone: 'America/New_York' },
        now,
      ),
    ).toBe(false)
  })
})

describe('isGoalDue (weekly)', () => {
  const goal = {
    cadence: 'weekly' as const,
    status: ACTIVE,
    lastBriefedAt: null as Date | null,
  }

  it('fires Monday 06:00 user-local', () => {
    // 2026-05-04 is a Monday. 06:05 EDT = 10:05 UTC.
    const now = new Date('2026-05-04T10:05:00Z')
    expect(isGoalDue(goal, { timezone: 'America/New_York' }, now)).toBe(true)
  })
  it('does not fire any other weekday', () => {
    // 2026-05-05 is Tuesday.
    const now = new Date('2026-05-05T10:05:00Z')
    expect(isGoalDue(goal, { timezone: 'America/New_York' }, now)).toBe(false)
  })
})

describe('isGoalDue (on_demand / paused)', () => {
  it('on_demand never fires', () => {
    expect(
      isGoalDue(
        { cadence: 'on_demand', status: ACTIVE, lastBriefedAt: null },
        { timezone: 'UTC' },
        new Date(),
      ),
    ).toBe(false)
  })
  it('paused goal never fires regardless of cadence', () => {
    expect(
      isGoalDue(
        { cadence: 'continuous', status: 'paused', lastBriefedAt: null },
        { timezone: 'UTC' },
        new Date(),
      ),
    ).toBe(false)
  })
})

describe('nextRunAt', () => {
  it('on_demand returns null', () => {
    expect(
      nextRunAt(
        { cadence: 'on_demand', status: ACTIVE, lastBriefedAt: null },
        { timezone: 'UTC' },
        new Date(),
      ),
    ).toBeNull()
  })
  it('continuous returns lastBriefedAt + 15min', () => {
    const last = new Date('2026-05-04T12:00:00Z')
    const now = new Date('2026-05-04T12:01:00Z')
    const next = nextRunAt(
      { cadence: 'continuous', status: ACTIVE, lastBriefedAt: last },
      { timezone: 'UTC' },
      now,
    )!
    expect(next.toISOString()).toBe('2026-05-04T12:15:00.000Z')
  })
  it('daily picks the next 06:00 local boundary', () => {
    const now = new Date('2026-05-04T15:00:00Z') // 11:00 NY
    const next = nextRunAt(
      { cadence: 'daily', status: ACTIVE, lastBriefedAt: null },
      { timezone: 'America/New_York' },
      now,
    )!
    // Next 06:00 NY = 10:00 UTC the next day.
    expect(next.toISOString()).toBe('2026-05-05T10:00:00.000Z')
  })
  it('weekly picks the next Monday 06:00 local', () => {
    // 2026-05-05 is a Tuesday.
    const now = new Date('2026-05-05T15:00:00Z')
    const next = nextRunAt(
      { cadence: 'weekly', status: ACTIVE, lastBriefedAt: null },
      { timezone: 'America/New_York' },
      now,
    )!
    // The next Monday is 2026-05-11; 06:00 NY = 10:00 UTC.
    expect(next.toISOString()).toBe('2026-05-11T10:00:00.000Z')
  })
})
