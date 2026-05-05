import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  primaryKey,
  jsonb,
  doublePrecision,
  index,
  date,
} from 'drizzle-orm/pg-core'

// ─── Auth.js ───────────────────────────────────────────────────────────────

export const users = pgTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  orcid: text('orcid'),
  affiliation: text('affiliation'),
  timezone: text('timezone'),
  onboardingCompletedAt: timestamp('onboarding_completed_at', { mode: 'date' }),
  dailyBudgetUsd: doublePrecision('daily_budget_usd').notNull().default(2),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
})

export const accounts = pgTable(
  'account',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type')
      .$type<'oauth' | 'oidc' | 'email' | 'webauthn'>()
      .notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
)

export const sessions = pgTable('session', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
})

export const verificationTokens = pgTable(
  'verification_token',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
)

// ─── Domain ────────────────────────────────────────────────────────────────

export const goalStatus = pgEnum('goal_status', ['active', 'paused', 'archived'])
export const goalCadence = pgEnum('goal_cadence', [
  'continuous',
  'daily',
  'weekly',
  'on_demand',
])
export const seedKind = pgEnum('seed_kind', [
  'category',
  'keyword',
  'author_orcid',
  'author_name',
  'paper_id',
  'venue',
])
export const followKind = pgEnum('follow_kind', ['author', 'paper', 'topic'])

export const goals = pgTable(
  'goal',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    status: goalStatus('status').notNull().default('active'),
    cadence: goalCadence('cadence').notNull().default('weekly'),
    lastBriefedAt: timestamp('last_briefed_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('goal_user_created_idx').on(t.userId, t.createdAt.desc())],
)

export const goalSeeds = pgTable(
  'goal_seed',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    goalId: text('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    kind: seedKind('kind').notNull(),
    value: text('value').notNull(),
    weight: doublePrecision('weight').notNull().default(1),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('goal_seed_goal_idx').on(t.goalId)],
)

export const authors = pgTable('author', {
  orcid: text('orcid').primaryKey(),
  displayName: text('display_name').notNull(),
  affiliation: text('affiliation'),
  hIndex: integer('h_index'),
  worksCount: integer('works_count'),
  citedByCount: integer('cited_by_count'),
  openalexAuthorId: text('openalex_author_id'),
  profileJson: jsonb('profile_json').$type<Record<string, unknown>>(),
  lastResolvedAt: timestamp('last_resolved_at', { mode: 'date' }).notNull().defaultNow(),
})

export const papers = pgTable(
  'paper',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    authorsJson: jsonb('authors_json').$type<string[]>().notNull().default([]),
    categoriesJson: jsonb('categories_json').$type<string[]>().notNull().default([]),
    publishedAt: date('published_at'),
    abstract: text('abstract'),
    doi: text('doi'),
    license: text('license'),
    sourceJson: jsonb('source_json').$type<Record<string, unknown>>(),
    lastFetchedAt: timestamp('last_fetched_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('paper_published_idx').on(t.publishedAt.desc())],
)

export const follows = pgTable(
  'follow',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: followKind('kind').notNull(),
    refId: text('ref_id').notNull(),
    label: text('label'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind, t.refId] })],
)

export const agentRole = pgEnum('agent_role', [
  'preview',
  'orchestrator',
  'scout',
  'analyst',
  'librarian',
  'editor',
])
export const runStatus = pgEnum('run_status', [
  'running',
  'completed',
  'failed',
])
export const stepKind = pgEnum('step_kind', [
  'tool_call',
  'message',
  'note',
])

export const agentRuns = pgTable(
  'agent_run',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    goalId: text('goal_id').references(() => goals.id, {
      onDelete: 'set null',
    }),
    parentRunId: text('parent_run_id'),
    agent: agentRole('agent').notNull(),
    status: runStatus('status').notNull().default('running'),
    startedAt: timestamp('started_at', { mode: 'date' }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { mode: 'date' }),
    costUsd: doublePrecision('cost_usd').notNull().default(0),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    summaryJson: jsonb('summary_json').$type<Record<string, unknown>>(),
    errorJson: jsonb('error_json').$type<Record<string, unknown>>(),
  },
  (t) => [
    index('agent_run_user_started_idx').on(t.userId, t.startedAt.desc()),
    index('agent_run_parent_idx').on(t.parentRunId),
  ],
)

export const agentSteps = pgTable(
  'agent_step',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    runId: text('run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    ord: integer('ord').notNull(),
    kind: stepKind('kind').notNull(),
    toolName: text('tool_name'),
    requestJson: jsonb('request_json').$type<Record<string, unknown>>(),
    responseJson: jsonb('response_json').$type<Record<string, unknown>>(),
    latencyMs: integer('latency_ms'),
    errorMessage: text('error_message'),
    ts: timestamp('ts', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('agent_step_run_ord_idx').on(t.runId, t.ord)],
)

export const briefingKind = pgEnum('briefing_kind', [
  'new_paper',
  'citation',
  'trend',
  'collaborator',
  'counter_evidence',
  'venue',
  'method_shift',
  'funder',
])
export const briefingPriority = pgEnum('briefing_priority', [
  'critical',
  'process',
  'opportunity',
  'signal',
])
export const briefingStatus = pgEnum('briefing_status', [
  'pending',
  'approved',
  'dismissed',
  'acted',
  'expired',
])
export const briefingSourceKind = pgEnum('briefing_source_kind', [
  'paper',
  'author',
  'query',
  'tool_call',
  'web',
])

export const tags = pgTable('tag', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  slug: text('slug').notNull().unique(),
  label: text('label').notNull(),
  embeddingId: text('embedding_id'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
})

export const briefings = pgTable(
  'briefing',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    goalId: text('goal_id').references(() => goals.id, { onDelete: 'set null' }),
    runId: text('run_id').references(() => agentRuns.id, {
      onDelete: 'set null',
    }),
    kind: briefingKind('kind').notNull(),
    priority: briefingPriority('priority').notNull(),
    status: briefingStatus('status').notNull().default('pending'),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    confidence: doublePrecision('confidence').notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('briefing_user_created_idx').on(t.userId, t.createdAt.desc()),
    index('briefing_user_status_idx').on(t.userId, t.status),
    index('briefing_goal_idx').on(t.goalId),
  ],
)

export const briefingSources = pgTable(
  'briefing_source',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    briefingId: text('briefing_id')
      .notNull()
      .references(() => briefings.id, { onDelete: 'cascade' }),
    kind: briefingSourceKind('kind').notNull(),
    refId: text('ref_id').notNull(),
    snippet: text('snippet'),
    position: integer('position').notNull().default(0),
    weight: doublePrecision('weight').notNull().default(1),
  },
  (t) => [index('briefing_source_briefing_idx').on(t.briefingId)],
)

export const briefingProvenance = pgTable('briefing_provenance', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  briefingId: text('briefing_id')
    .notNull()
    .unique()
    .references(() => briefings.id, { onDelete: 'cascade' }),
  reasoning: text('reasoning').notNull(),
  whatIWillDo: text('what_i_will_do').notNull(),
  scopeJson: jsonb('scope_json').$type<Record<string, unknown>>(),
  alternativesConsideredJson: jsonb('alternatives_considered_json').$type<unknown[]>(),
})

export const briefingTags = pgTable(
  'briefing_tag',
  {
    briefingId: text('briefing_id')
      .notNull()
      .references(() => briefings.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    score: doublePrecision('score').notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.briefingId, t.tagId] })],
)

export const actionKind = pgEnum('action_kind', [
  'approve',
  'dismiss',
  'save',
  'more_like_this',
  'snooze',
  'open',
  'undo',
])
export const actionSource = pgEnum('action_source', ['web', 'email', 'voice'])
export const auditKind = pgEnum('audit_kind', [
  'action',
  'run_started',
  'run_completed',
  'run_failed',
  'note',
])

export const actions = pgTable(
  'action',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    briefingId: text('briefing_id')
      .notNull()
      .references(() => briefings.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: actionKind('kind').notNull(),
    source: actionSource('source').notNull().default('web'),
    detailsJson: jsonb('details_json').$type<Record<string, unknown>>(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    undoneAt: timestamp('undone_at', { mode: 'date' }),
    undoneByActionId: text('undone_by_action_id'),
  },
  (t) => [
    index('action_user_created_idx').on(t.userId, t.createdAt.desc()),
    index('action_briefing_idx').on(t.briefingId),
  ],
)

export const auditEntries = pgTable(
  'audit_entry',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    briefingId: text('briefing_id').references(() => briefings.id, {
      onDelete: 'cascade',
    }),
    runId: text('run_id').references(() => agentRuns.id, {
      onDelete: 'set null',
    }),
    actionId: text('action_id').references(() => actions.id, {
      onDelete: 'set null',
    }),
    kind: auditKind('kind').notNull(),
    source: actionSource('source').notNull().default('web'),
    message: text('message').notNull(),
    payloadJson: jsonb('payload_json').$type<Record<string, unknown>>(),
    ts: timestamp('ts', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_user_ts_idx').on(t.userId, t.ts.desc()),
    index('audit_briefing_idx').on(t.briefingId),
    index('audit_run_idx').on(t.runId),
  ],
)

export const credentials = pgTable('credential', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  valencyTokenCipher: text('valency_token_cipher').notNull(),
  valencyTokenLast4: text('valency_token_last4').notNull(),
  lastVerifiedAt: timestamp('last_verified_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
})

// ─── Inferred types ────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Goal = typeof goals.$inferSelect
export type NewGoal = typeof goals.$inferInsert
export type GoalSeed = typeof goalSeeds.$inferSelect
export type NewGoalSeed = typeof goalSeeds.$inferInsert
export type Author = typeof authors.$inferSelect
export type Paper = typeof papers.$inferSelect
export type Follow = typeof follows.$inferSelect
export type Credential = typeof credentials.$inferSelect
export type AgentRun = typeof agentRuns.$inferSelect
export type NewAgentRun = typeof agentRuns.$inferInsert
export type AgentStep = typeof agentSteps.$inferSelect
export type NewAgentStep = typeof agentSteps.$inferInsert
export type Briefing = typeof briefings.$inferSelect
export type NewBriefing = typeof briefings.$inferInsert
export type BriefingSource = typeof briefingSources.$inferSelect
export type BriefingProvenance = typeof briefingProvenance.$inferSelect
export type BriefingTag = typeof briefingTags.$inferSelect
export type Tag = typeof tags.$inferSelect
export type Action = typeof actions.$inferSelect
export type NewAction = typeof actions.$inferInsert
export type AuditEntry = typeof auditEntries.$inferSelect
export type NewAuditEntry = typeof auditEntries.$inferInsert
