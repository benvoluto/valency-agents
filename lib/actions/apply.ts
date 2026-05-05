import { and, desc, eq, gte, isNull } from 'drizzle-orm'
import { db } from '@/db'
import {
  actions,
  auditEntries,
  briefingSources,
  briefings,
  follows,
  goalSeeds,
  goals,
  type Action,
} from '@/db/schema'

export class ActionError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'ActionError'
  }
}

export type ActionKind =
  | 'approve'
  | 'dismiss'
  | 'save'
  | 'more_like_this'
  | 'snooze'
  | 'open'
  | 'undo'

export type ActionSource = 'web' | 'email' | 'voice'

export interface ApplyActionInput {
  userId: string
  briefingId: string
  kind: ActionKind
  details?: Record<string, unknown>
  idempotencyKey: string
  source?: ActionSource
}

export interface ApplyActionResult {
  action: Action
  /** Optional follow-up: e.g. created goal id from more_like_this. */
  derivedGoalId?: string
  /** Concise human-readable summary (used for audit + UndoBar). */
  summary: string
}

/**
 * Builds a "what will this do" preview without mutating anything. Renders
 * inside the DryRun modal before the user confirms.
 */
export async function dryRunAction(input: {
  userId: string
  briefingId: string
  kind: ActionKind
}): Promise<{ summary: string; effects: string[] }> {
  const briefing = await loadBriefing(input.userId, input.briefingId)
  switch (input.kind) {
    case 'approve':
      return {
        summary: 'Approve briefing',
        effects: [
          `Status: ${briefing.status} → approved`,
          'Audit entry written',
        ],
      }
    case 'dismiss':
      return {
        summary: 'Dismiss briefing',
        effects: [
          `Status: ${briefing.status} → dismissed`,
          'Briefing hidden from the default feed',
          'Reversible for 24 hours',
        ],
      }
    case 'save': {
      const sources = await db
        .select()
        .from(briefingSources)
        .where(eq(briefingSources.briefingId, input.briefingId))
      const papers = sources.filter((s) => s.kind === 'paper')
      const authors = sources.filter((s) => s.kind === 'author')
      return {
        summary: `Save to library (${papers.length} paper${papers.length === 1 ? '' : 's'}${
          authors.length > 0 ? `, ${authors.length} author${authors.length === 1 ? '' : 's'}` : ''
        })`,
        effects: [
          `Status: ${briefing.status} → acted`,
          `Add ${papers.length} paper follow${papers.length === 1 ? '' : 's'} to your library`,
          authors.length > 0
            ? `Add ${authors.length} author follow${authors.length === 1 ? '' : 's'}`
            : 'No author follows added',
          'Reversible for 24 hours',
        ],
      }
    }
    case 'more_like_this': {
      const sources = await db
        .select()
        .from(briefingSources)
        .where(eq(briefingSources.briefingId, input.briefingId))
      const papers = sources.filter((s) => s.kind === 'paper')
      return {
        summary: `Create derived goal "Like: ${truncate(briefing.title, 40)}"`,
        effects: [
          `New weekly goal seeded with ${papers.length} paper${papers.length === 1 ? '' : 's'}`,
          'Next pipeline run on the goal will surface follow-ups',
        ],
      }
    }
    default:
      return { summary: input.kind, effects: [] }
  }
}

export async function applyAction(
  input: ApplyActionInput,
): Promise<ApplyActionResult> {
  const source = input.source ?? 'web'

  // Idempotency — return the existing action if the same key is replayed.
  const [existing] = await db
    .select()
    .from(actions)
    .where(eq(actions.idempotencyKey, input.idempotencyKey))
    .limit(1)
  if (existing) {
    if (existing.userId !== input.userId) {
      throw new ActionError('idempotencyKey collision', 409)
    }
    return {
      action: existing,
      summary: existing.detailsJson?.summary as string | undefined ?? 'replay',
    }
  }

  if (input.kind === 'undo') {
    return undoLastAction({
      userId: input.userId,
      briefingId: input.briefingId,
      idempotencyKey: input.idempotencyKey,
      source,
    })
  }

  const briefing = await loadBriefing(input.userId, input.briefingId)

  switch (input.kind) {
    case 'approve':
      return executeStatusFlip({
        input,
        source,
        nextStatus: 'approved',
        summary: `approved "${truncate(briefing.title, 60)}"`,
      })
    case 'dismiss':
      return executeStatusFlip({
        input,
        source,
        nextStatus: 'dismissed',
        summary: `dismissed "${truncate(briefing.title, 60)}"`,
      })
    case 'save':
      return executeSave({ input, source, briefingTitle: briefing.title })
    case 'more_like_this':
      return executeMoreLikeThis({
        input,
        source,
        briefingTitle: briefing.title,
        goalId: briefing.goalId,
      })
    case 'open':
    case 'snooze':
      return executeNoOp({ input, source, kind: input.kind })
    default:
      throw new ActionError(`Unsupported action kind: ${input.kind}`, 400)
  }
}

async function loadBriefing(userId: string, briefingId: string) {
  const [b] = await db
    .select()
    .from(briefings)
    .where(and(eq(briefings.id, briefingId), eq(briefings.userId, userId)))
    .limit(1)
  if (!b) throw new ActionError('Briefing not found', 404)
  return b
}

async function executeStatusFlip(args: {
  input: ApplyActionInput
  source: ActionSource
  nextStatus: 'approved' | 'dismissed' | 'acted'
  summary: string
}): Promise<ApplyActionResult> {
  const { input, source, nextStatus, summary } = args
  const result = await db.transaction(async (tx) => {
    await tx
      .update(briefings)
      .set({ status: nextStatus })
      .where(
        and(
          eq(briefings.id, input.briefingId),
          eq(briefings.userId, input.userId),
        ),
      )
    const [action] = await tx
      .insert(actions)
      .values({
        briefingId: input.briefingId,
        userId: input.userId,
        kind: input.kind,
        source,
        idempotencyKey: input.idempotencyKey,
        detailsJson: { summary, prevStatus: 'pending' } as Record<string, unknown>,
      })
      .returning()
    await tx.insert(auditEntries).values({
      userId: input.userId,
      briefingId: input.briefingId,
      actionId: action.id,
      kind: 'action',
      source,
      message: summary,
      payloadJson: { kind: input.kind, status: nextStatus } as Record<string, unknown>,
    })
    return { action }
  })
  return { action: result.action, summary }
}

async function executeSave(args: {
  input: ApplyActionInput
  source: ActionSource
  briefingTitle: string
}): Promise<ApplyActionResult> {
  const { input, source, briefingTitle } = args
  const sources = await db
    .select()
    .from(briefingSources)
    .where(eq(briefingSources.briefingId, input.briefingId))
  const paperRefs = sources.filter((s) => s.kind === 'paper')
  const authorRefs = sources.filter((s) => s.kind === 'author')
  const summary = `saved "${truncate(briefingTitle, 60)}" to your library`

  const result = await db.transaction(async (tx) => {
    await tx
      .update(briefings)
      .set({ status: 'acted' })
      .where(
        and(
          eq(briefings.id, input.briefingId),
          eq(briefings.userId, input.userId),
        ),
      )

    if (paperRefs.length > 0) {
      await tx
        .insert(follows)
        .values(
          paperRefs.map((s) => ({
            userId: input.userId,
            kind: 'paper' as const,
            refId: s.refId,
            label: s.snippet ?? null,
          })),
        )
        .onConflictDoNothing()
    }
    if (authorRefs.length > 0) {
      await tx
        .insert(follows)
        .values(
          authorRefs.map((s) => ({
            userId: input.userId,
            kind: 'author' as const,
            refId: s.refId,
            label: s.snippet ?? null,
          })),
        )
        .onConflictDoNothing()
    }

    const [action] = await tx
      .insert(actions)
      .values({
        briefingId: input.briefingId,
        userId: input.userId,
        kind: 'save',
        source,
        idempotencyKey: input.idempotencyKey,
        detailsJson: {
          summary,
          paperRefs: paperRefs.map((s) => s.refId),
          authorRefs: authorRefs.map((s) => s.refId),
        } as Record<string, unknown>,
      })
      .returning()
    await tx.insert(auditEntries).values({
      userId: input.userId,
      briefingId: input.briefingId,
      actionId: action.id,
      kind: 'action',
      source,
      message: summary,
      payloadJson: {
        papers: paperRefs.length,
        authors: authorRefs.length,
      } as Record<string, unknown>,
    })
    return { action }
  })

  return { action: result.action, summary }
}

async function executeMoreLikeThis(args: {
  input: ApplyActionInput
  source: ActionSource
  briefingTitle: string
  goalId: string | null
}): Promise<ApplyActionResult> {
  const { input, source, briefingTitle } = args
  const sources = await db
    .select()
    .from(briefingSources)
    .where(eq(briefingSources.briefingId, input.briefingId))
  const paperSeeds = sources.filter((s) => s.kind === 'paper')
  const authorSeeds = sources.filter((s) => s.kind === 'author')
  const newTitle = `Like: ${truncate(briefingTitle, 100)}`
  const summary = `created derived goal "${truncate(newTitle, 60)}"`

  const result = await db.transaction(async (tx) => {
    const [newGoal] = await tx
      .insert(goals)
      .values({
        userId: input.userId,
        title: newTitle,
        description: `Derived from briefing "${briefingTitle}".`,
        cadence: 'weekly',
      })
      .returning()

    const seeds = [
      ...paperSeeds.map((s) => ({
        goalId: newGoal.id,
        kind: 'paper_id' as const,
        value: s.refId,
      })),
      ...authorSeeds.map((s) => ({
        goalId: newGoal.id,
        kind: 'author_orcid' as const,
        value: s.refId,
      })),
    ]
    if (seeds.length > 0) {
      await tx.insert(goalSeeds).values(seeds)
    }

    const [action] = await tx
      .insert(actions)
      .values({
        briefingId: input.briefingId,
        userId: input.userId,
        kind: 'more_like_this',
        source,
        idempotencyKey: input.idempotencyKey,
        detailsJson: {
          summary,
          derivedGoalId: newGoal.id,
          seedCount: seeds.length,
        } as Record<string, unknown>,
      })
      .returning()
    await tx.insert(auditEntries).values({
      userId: input.userId,
      briefingId: input.briefingId,
      actionId: action.id,
      kind: 'action',
      source,
      message: summary,
      payloadJson: {
        derivedGoalId: newGoal.id,
        seeds: seeds.length,
      } as Record<string, unknown>,
    })
    return { action, derivedGoalId: newGoal.id }
  })

  return {
    action: result.action,
    derivedGoalId: result.derivedGoalId,
    summary,
  }
}

async function executeNoOp(args: {
  input: ApplyActionInput
  source: ActionSource
  kind: 'open' | 'snooze'
}): Promise<ApplyActionResult> {
  const { input, source, kind } = args
  const summary =
    kind === 'open' ? 'opened briefing' : 'snoozed briefing for 7 days'
  const result = await db.transaction(async (tx) => {
    const [action] = await tx
      .insert(actions)
      .values({
        briefingId: input.briefingId,
        userId: input.userId,
        kind,
        source,
        idempotencyKey: input.idempotencyKey,
        detailsJson: { summary } as Record<string, unknown>,
      })
      .returning()
    await tx.insert(auditEntries).values({
      userId: input.userId,
      briefingId: input.briefingId,
      actionId: action.id,
      kind: 'action',
      source,
      message: summary,
      payloadJson: { kind } as Record<string, unknown>,
    })
    return { action }
  })
  return { action: result.action, summary }
}

async function undoLastAction(args: {
  userId: string
  briefingId: string
  idempotencyKey: string
  source: ActionSource
}): Promise<ApplyActionResult> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [target] = await db
    .select()
    .from(actions)
    .where(
      and(
        eq(actions.userId, args.userId),
        eq(actions.briefingId, args.briefingId),
        gte(actions.createdAt, cutoff),
        isNull(actions.undoneAt),
      ),
    )
    .orderBy(desc(actions.createdAt))
    .limit(1)
  if (!target) {
    throw new ActionError('Nothing to undo within the last 24 hours.', 404)
  }
  if (target.kind === 'undo') {
    throw new ActionError("Can't undo an undo.", 400)
  }
  return reverseAction(target, args)
}

async function reverseAction(
  target: Action,
  args: {
    userId: string
    briefingId: string
    idempotencyKey: string
    source: ActionSource
  },
): Promise<ApplyActionResult> {
  const summary = `undid ${target.kind}`
  const result = await db.transaction(async (tx) => {
    // Reverse the side-effects per kind.
    if (target.kind === 'approve' || target.kind === 'dismiss' || target.kind === 'save') {
      await tx
        .update(briefings)
        .set({ status: 'pending' })
        .where(
          and(
            eq(briefings.id, args.briefingId),
            eq(briefings.userId, args.userId),
          ),
        )
    }
    if (target.kind === 'save') {
      const details = target.detailsJson as
        | { paperRefs?: string[]; authorRefs?: string[] }
        | null
      if (details?.paperRefs?.length) {
        for (const refId of details.paperRefs) {
          await tx
            .delete(follows)
            .where(
              and(
                eq(follows.userId, args.userId),
                eq(follows.kind, 'paper'),
                eq(follows.refId, refId),
              ),
            )
        }
      }
      if (details?.authorRefs?.length) {
        for (const refId of details.authorRefs) {
          await tx
            .delete(follows)
            .where(
              and(
                eq(follows.userId, args.userId),
                eq(follows.kind, 'author'),
                eq(follows.refId, refId),
              ),
            )
        }
      }
    }
    if (target.kind === 'more_like_this') {
      const details = target.detailsJson as { derivedGoalId?: string } | null
      if (details?.derivedGoalId) {
        await tx
          .delete(goals)
          .where(
            and(
              eq(goals.id, details.derivedGoalId),
              eq(goals.userId, args.userId),
            ),
          )
      }
    }

    const [undoAction] = await tx
      .insert(actions)
      .values({
        briefingId: args.briefingId,
        userId: args.userId,
        kind: 'undo',
        source: args.source,
        idempotencyKey: args.idempotencyKey,
        detailsJson: {
          summary,
          undidActionId: target.id,
          undidKind: target.kind,
        } as Record<string, unknown>,
      })
      .returning()

    await tx
      .update(actions)
      .set({ undoneAt: new Date(), undoneByActionId: undoAction.id })
      .where(eq(actions.id, target.id))

    await tx.insert(auditEntries).values({
      userId: args.userId,
      briefingId: args.briefingId,
      actionId: undoAction.id,
      kind: 'action',
      source: args.source,
      message: summary,
      payloadJson: { undidKind: target.kind, undidActionId: target.id } as Record<string, unknown>,
    })
    return { action: undoAction }
  })
  return { action: result.action, summary }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

/** Returns the most-recent reversible action within 24h, or null. */
export async function latestReversibleAction(userId: string): Promise<Action | null> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [row] = await db
    .select()
    .from(actions)
    .where(
      and(
        eq(actions.userId, userId),
        gte(actions.createdAt, cutoff),
        isNull(actions.undoneAt),
      ),
    )
    .orderBy(desc(actions.createdAt))
    .limit(1)
  if (!row) return null
  if (row.kind === 'undo' || row.kind === 'open') return null
  return row
}
