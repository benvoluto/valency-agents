# Valency-Agents — Build Plan

A Next.js + Vercel app that puts a small team of Claude (Opus) agents in front of an academic researcher and uses the Valency MCP server (arXiv corpus, 37 endpoints) to push 3–9 high-signal proposals per day, with rich source/trust scaffolding, two-way email, in-app conversation, and a topic/tag browse with a lightweight knowledge map.

## 0. Context (read first)

This is the Valency-side companion to the Faros exercise in `../farosresponse`. The thesis is the same: **agentic AI doesn't replace the surface, it replaces the chore of asking**. A researcher should not have to type "what new papers cite my 2024 work on X" every Monday — a small team of agents should already have run that question, weighed it against everything else they could have surfaced, and presented a short, ranked, source-attributed briefing in app, in email, and (Phase 2) by phone.

Three references shape this build, and you should re-read them before writing code:

- `../farosresponse/workday-prototype-build-plan.md` — the structural pattern for the home surface (suggested-actions feed, Explain drawer, sources popover, scope/confidence chips, dry-run/audit/undo) is what we're adapting. Card anatomy, drawer anatomy, and trust-scaffolding pattern map directly.
- `../farosresponse/Employee View.png` and `Manager View.png` — the visual target. The home surface here is the academic-researcher analog of "Today's Briefing".
- `../farosresponse/ResponseText.md` — the philosophy. "The graph is the noun"; agents earn their leash; the same Explain/dry-run/audit/undo loop applies.

Valency reference:

- 37 MCP endpoints organized as Search & Discovery, Filtering, Author Intelligence, Paper Details, Trends & Analytics, Corpus Info, Export, Feedback. Highlights: `semantic_search_papers`, `find_similar_papers`, `get_citing_papers`, `resolve_orcid`, `get_author_profile`, `find_coauthors`, `compare_authors`, `get_keyword_trends`, `get_publication_trends`, `identify_research_domains`, `export_papers_bibtex`.
- Endpoint: `POST https://labs.valency.io/mcp`, JSON-RPC 2.0, `Authorization: Bearer <token>`. Health: `GET https://labs.valency.io/health`. Tokens are issued per user from `app.valency.io/settings`.
- Anthropic Messages API consumes the Valency MCP server natively via the `mcp_servers` parameter, so we do not need to re-implement a JSON-RPC client just to give the model tools — but we **do** need our own server-side MCP client for the agent team's deterministic search/analysis steps that run outside a model turn.

Researcher practices we are designing for (informed by literature on scholarly-information seeking + interviews-grade common knowledge — validate with 2–3 real researchers in Phase 0):

- Tracking new arXiv submissions and v2 revisions in a small set of categories
- Following 5–50 specific authors (advisor, peers, "rivals", students, frequent collaborators)
- Watching citations of their own work and key prior art
- Spotting methodological shifts in their subfield (e.g., a method's usage curve)
- Triaging conference/preprint pre-announcements via abstract comments
- Identifying potential collaborators with complementary skill graphs
- Hunting counter-evidence to a draft they're writing
- Building reading lists for grants, courses, advisees

The thesis: most of those are recurring queries that the researcher reformulates by hand every week. Agents pre-run them, rank by novelty × relevance × source-strength, and present a **briefing**, not a search box.

## 1. Naming 
The domain is researchagents.io. 

## 2. Architecture summary

```
                 ┌──────────────────────────┐
                 │  Next.js (App Router) on │
                 │  Vercel                  │   ── deployed first commit
                 │                          │
  Google OAuth ──▶  Auth.js v5             │
                 │                          │
                 │  /app : home surface,    │
                 │         briefings,       │
                 │         topics, chat     │
                 │                          │
                 │  /api : Inngest send,    │
                 │         Mailgun in,      │
                 │         action handlers, │
                 │         health           │
                 └────────┬─────────────────┘
                          │
       ┌──────────────────┼──────────────────┐
       │                  │                  │
       ▼                  ▼                  ▼
  Neon Postgres     Inngest Cloud       Mailgun
  (Drizzle ORM)     (durable workflows) (out + inbound webhook)
                          │
                          ▼
                ┌──────────────────────┐
                │  Anthropic Messages  │
                │  (Opus) + MCP        │
                │  ── Valency MCP      │
                │  ── internal tools   │
                └──────────────────────┘
```

The agent team is a small set of role-specialized prompts run by Inngest steps, each calling Anthropic Messages with the Valency MCP server attached and a tight allowed-tool list. Nothing about the team requires the Claude Agent SDK — keeping it raw Messages + MCP makes the dependency surface small and gives us full control over per-step retries, dedupe, and cost ceilings, which Inngest needs anyway.

## 3. Tech stack (locked)

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router, current version on disk) | `AGENTS.md` warns this is *not* the Next.js you know — read `node_modules/next/dist/docs/` before writing anything Next-specific. |
| Language | TypeScript strict | `tsconfig.json` already strict. |
| Styling | Tailwind v4 + design tokens | Tokens mirror the Faros system; declared via `@theme` in `app/globals.css` (no `tailwind.config.ts`). |
| Auth | Auth.js v5 (Google provider only) | Cookie-based session, JWT strategy, custom `User` table in Postgres via the Drizzle adapter. |
| DB | Neon Postgres + Drizzle ORM | Use the pooled `DATABASE_URL` for app traffic, unpooled for migrations. |
| Migrations | `drizzle-kit` | `drizzle/` directory under repo root. |
| Background jobs | Inngest | Event-driven, durable, exact-once-ish. Free tier covers dev. |
| AI | Anthropic Messages API, model `claude-opus-4-7` | Streaming on chat, non-streaming for agent steps. |
| Tools | Valency MCP at `https://labs.valency.io/mcp` (bearer token per user) | Wired in via `mcp_servers` on Messages. Server-side MCP client also implemented for deterministic non-LLM lookups. |
| Email | Mailgun (`researchagents.io`) | Outbound HTML+text, inbound webhook with HMAC signature verification. |
| Realtime UI | Server-Sent Events from Anthropic streaming + `useOptimistic` for action handlers | No websockets in v1. |
| Observability | Vercel logs + Sentry + Inngest UI | Structured logs with a request-id and a run-id. |
| Testing | Vitest (unit), Playwright (integration + E2E), Drizzle test schema | Per-phase integration tests required. |
| Lint/format | ESLint flat config (already in repo) + Prettier | CI gate. |

Out: shadcn-as-dependency (we copy components in), Prisma, Lucia, NextAuth v4, Trigger.dev, OpenClaw, Twilio (Phase 2).

## 4. Visual system

Adapted from Faros, retuned for an academic researcher (calmer, more readable, less corporate-saturated).

Tokens (declared via Tailwind v4 `@theme` in `app/globals.css`):

- `--bg` `#FAFAF7` (off-white)
- `--surface` `#FFFFFF`
- `--ink` `#141414`
- `--ink-muted` `#5C5C5C`
- `--border` `#E6E4DE`
- `--accent` `#3A4FBF` (deep indigo — primary)
- `--accent-soft` `#EEF1FF`
- `--priority-critical` `#C2410C` (orange — counter-evidence, deadline)
- `--priority-process` `#2E5BFF` (blue — in-flight, queued)
- `--priority-opportunity` `#0F8B7A` (teal — collab, funding)
- `--priority-signal` `#A56A00` (amber — trend, citation alert)
- `--audit` `#3F4756` (slate)

Typography: `Fraunces` (serif) for H1 + display numerals; `Inter` for everything else; `JetBrains Mono` for audit timestamps and tool-call headers. Loaded via `next/font/google`.

Card anatomy (Faros-equivalent, adapted):

- 32×32 rounded-square category icon (top-left): paper, author, trend, citation, funder, deadline.
- Title (medium 16px) — one line, ellipsize at 90 chars.
- Subtitle (regular 13px, ink-muted) — one-line context, e.g. *"From your 'attention-mechanism limits' goal · 4 papers, 2 authors you follow"*.
- Priority badge (top-right, 11px caps tracked).
- Confidence chip (e.g. `High · 92%`) inline left of priority badge.
- Two subtle text actions bottom-left: `Explain` and `Show sources`.
- Primary CTA right: contextual ("Save to library", "Draft note", "Open in Valency", "Dismiss as off-topic").

Right sidebar:

- Researcher photo + display name + role/affiliation + ORCID + briefings-this-week count.
- "Ask any question…" input (functional in v1 — opens a thread in the chat surface).
- Quick actions (5): New goal · Pause briefings · Library · Topics · Settings.
- In Progress: 2–4 currently-running agent jobs and their ETA.

Mobile: same components, sidebar collapses below the feed in a drawer; cards full-width with priority chip moving below the title; right rail becomes a sheet behind the avatar tap.

## 5. Routes (App Router)

```
/                            landing — Google sign-in, marketing one-liner, password gate "designgeek" if you want parity w/ Faros (default off)
/onboarding                  3-step: ORCID resolve → goals → briefing cadence
/app                         home surface — today's briefings (the Faros analog)
/app/briefings/[id]          single-briefing detail — full Explain, full source list, action panel, audit trail
/app/topics                  tag list + filtered feed
/app/topics/[slug]           tag view — papers, authors, related goals
/app/map                     lightweight knowledge map (force-directed, Phase 11)
/app/library                 saved papers / authors / queries
/app/chat                    conversational surface (Anthropic Messages + Valency MCP)
/app/chat/[threadId]
/app/goals                   goal CRUD
/app/settings                Valency token, email prefs, briefing cadence per goal, danger zone
/app/runs/[runId]            agent run inspector — full step trace, tool calls, costs
/api/auth/[...nextauth]      Auth.js
/api/inngest                 Inngest function registry
/api/mailgun/inbound         inbound email webhook (HMAC verified)
/api/mailgun/events          delivery/bounce events
/api/briefings/:id/action    action handler (approve, dismiss, save, more-like-this)
/api/chat/stream             SSE for chat
/api/health                  liveness — DB ping, Anthropic ping, Valency ping
```

## 6. Data model (Drizzle, in `db/schema.ts`)

This is the noun graph. Cards, briefings, agent runs, and audit entries all reference these objects by typed ID.

```ts
users          { id, googleSub, email, displayName, photoUrl, orcid, affiliation, timezone, createdAt }
sessions       { id, userId, expiresAt, ... } // Auth.js
credentials    { userId, valencyToken (encrypted), valencyTokenLast4, lastVerifiedAt }
goals          { id, userId, title, description, status: active|paused|archived,
                 cadence: continuous|daily|weekly|on_demand,
                 lastBriefedAt, createdAt }
goalSeeds      { id, goalId, kind: 'category'|'keyword'|'author_orcid'|'paper_id'|'venue', value, weight }
authors        { orcid (pk), displayName, affiliation, hIndex, lastResolvedAt, profileJson }
papers         { id (pk = arxiv id), title, authors[], categories[], publishedAt, abstract,
                 doi, license, sourceJson, lastFetchedAt }
follows        { userId, kind: 'author'|'paper'|'topic', refId, createdAt }   // explicit researcher follows
briefings      { id, userId, goalId, kind: 'new_paper'|'citation'|'trend'|'collaborator'|'counter_evidence'|'venue'|'method_shift'|'funder',
                 title, summary, confidence (0-1), priority: critical|process|opportunity|signal,
                 status: pending|approved|dismissed|acted|expired,
                 createdAt, runId, tags[] }
briefingSources    { id, briefingId, kind: 'paper'|'author'|'query'|'tool_call'|'web', refId,
                     snippet, position, weight }   // what powered the card
briefingProvenance { id, briefingId, reasoning (text), whatIWillDo (text),
                     scopeJson, alternativesConsideredJson }
actions        { id, briefingId, userId, kind: 'approve'|'dismiss'|'save'|'more_like_this'|'snooze'|'open',
                 detailsJson, source: 'web'|'email'|'voice', createdAt }
auditEntries   { id, userId, briefingId?, runId?, kind, message, ts (with index), payloadJson }
agentRuns      { id, userId, goalId?, agent: 'scout'|'analyst'|'librarian'|'editor',
                 startedAt, finishedAt, status, costUsd, tokensIn, tokensOut, errorJson }
agentSteps     { id, runId, ord, kind: 'tool_call'|'message'|'note',
                 toolName?, requestJson, responseJson, latencyMs, ts }
threads        { id, userId, title, createdAt, lastMessageAt }
messages       { id, threadId, role: 'user'|'assistant'|'tool', contentJson, createdAt,
                 toolCallsJson, costUsd, tokensIn, tokensOut }
emails         { id, userId, kind: 'digest'|'one_off', subject, mailgunId, status, sentAt }
emailEvents    { id, emailId, kind: 'delivered'|'opened'|'clicked'|'failed'|'replied', payload, ts }
inboundEmails  { id, userId?, fromAddr, subject, parsedIntent, parsedBriefingId?, raw, hmacOk, ts }
tags           { id, label, slug, embeddingId? }
briefingTags   { briefingId, tagId, score }
```

Indexes worth declaring up front: `briefings(userId, createdAt desc)`, `briefings(userId, status)`, `agentRuns(userId, startedAt desc)`, `auditEntries(userId, ts desc)`, `papers(publishedAt)`, `authors(orcid)`, plus a GIN index on `briefings.tags` for the topic browse.

Encryption: `credentials.valencyToken` stored encrypted (AES-GCM with a key in `BRIEFING_ENC_KEY` env var). Never log. Never return to client; the UI only shows last4 and "rotate".

## 7. Agent team

Four roles, each a specialized system prompt. None of them are general assistants — each has a narrow job, a small allowed-tool list, and a structured output schema. The Editor is the only one that produces a user-visible briefing.

| Role | Job | Allowed Valency tools | Allowed internal tools |
|---|---|---|---|
| **Scout** | Given a goal seed (keywords, categories, followed authors), enumerate up to 50 candidate items in the last N days. | `semantic_search_papers`, `search_by_category`, `search_by_author`, `find_papers_by_researcher`, `find_similar_papers`, `get_citing_papers`, `filter_by_date_range`, `get_keyword_trends`, `get_publication_trends` | `db.recentlyShown` (dedupe), `db.followedAuthors` |
| **Analyst** | For each candidate, score novelty × relevance × source-strength against the goal, attach evidence, drop noise. | `find_similar_papers`, `get_citing_papers`, `compare_authors`, `get_author_profile`, `analyze_corpus_metrics` | `db.userHistory`, `db.priorBriefings` |
| **Librarian** | Tag, normalize, and link items; resolve ORCIDs; merge near-duplicates with prior briefings. | `resolve_orcid`, `get_author_identity`, `find_coauthors`, `get_paper_versions` | `db.upsertAuthor`, `db.upsertPaper`, `db.upsertTag` |
| **Editor** | From the analyst's ranked shortlist, pick 3–9 final briefings, write the title/summary/confidence/priority, write the Explain block (`reasoning`, `whatIWillDo`, `scope`, `alternativesConsidered`), and emit structured JSON. | (none — no fresh tool calls; works only from the prepared shortlist) | `db.writeBriefing`, `db.writeProvenance`, `db.writeSources` |

Each role:

- Runs as an Inngest step with a 60s soft timeout, 3-attempt retry on transient errors only.
- Outputs validated against a Zod schema; bad JSON triggers one retry with the validator error appended, then a hard fail (logged as `agentRuns.errorJson`, no briefing written).
- Has a per-run cost ceiling; Editor will not be called if the upstream spend already exceeded the goal's daily budget.
- Logs every tool call to `agentSteps` with full request/response (raw, redacted of the bearer token).

We deliberately do not let the Editor make new tool calls. That keeps the briefing's source list closed — every claim in the Explain pane points to a `briefingSources` row that the Scout/Analyst/Librarian actually retrieved. This is the source-of-truth contract that the trust scaffolding relies on.

## 8. Briefing pipeline (Inngest, event-driven)

Events:

- `goal.created` / `goal.updated` → schedule a one-off run.
- `signal.poll.tick` (cron, every 15 min per active goal cluster) → check whether the goal's seeds have any new arXiv items since `lastBriefedAt`; if yes, emit `goal.run.requested`.
- `goal.run.requested` → main pipeline.
- `briefing.created` → fan-out to delivery: in-app live update + email queue (debounced).
- `email.inbound.received` → parse intent, emit `briefing.action.requested`.
- `briefing.action.requested` → write `actions` row, emit `briefing.action.committed`, update card status.

Main pipeline (`functions/runGoal.ts`):

1. `loadGoal` — fetch goal + seeds + credentials. Bail if Valency token missing or invalid.
2. `scout` — Anthropic call w/ Scout prompt + Valency MCP, returns up to 50 candidates JSON.
3. `analyst` — Anthropic call w/ Analyst prompt, takes Scout output, returns ranked shortlist up to 15.
4. `librarian` — Anthropic call w/ Librarian prompt, takes shortlist, returns normalized objects + tag set; upserts authors/papers/tags into Postgres in a transaction.
5. `editor` — Anthropic call w/ Editor prompt, picks 3–9 briefings, returns structured briefings.
6. `materialize` — write `briefings`, `briefingSources`, `briefingProvenance`, `briefingTags` rows in a transaction. Emit `briefing.created` per row.
7. `digestQueue` — debounced 10-minute window; coalesces multiple `briefing.created` events into one digest send per user.
8. `audit` — write `auditEntries`: run finished, N briefings produced, cost, tokens, latency.

Dedupe: every Scout candidate has a stable hash `(arxivId, goalId)`; before materialize, drop any whose hash was emitted as a briefing in the last 30 days. Editor sees the dedup-filtered list.

Cost guardrails: per-user daily ceiling (`users.dailyBudgetUsd`, default $2.00), per-goal per-run ceiling, hard kill at 2× budget with an audit entry. Anthropic spend tracked per step; if a step would exceed, downgrade to `claude-haiku-4-5` for the Scout/Librarian steps only, never for Editor.

## 9. Trust scaffolding (the Faros pattern, applied)

Every briefing card and every action surface has an `Explain` button that opens a right-side drawer with four sections, populated **directly from the database**, never from a fresh LLM call:

1. **Why this surfaced.** Plain English. *"Your goal 'limits of attention mechanisms in long-context LLMs' has 3 author-follow seeds. Author Y posted a v2 yesterday that semantically matches your goal at 0.87. The Analyst flagged it as counter-evidence to your draft section 3 (provenance: similar-paper match to your saved paper P-123)."*
2. **What I looked at.** Typed chips per `briefingSources` row: `Paper:arxiv:2406.12345`, `Author:0000-0001-2345-6789`, `Tool:semantic_search_papers`, `Query:"long-context attention sinks 2025"`. Each chip is a link to a sub-page or popover with the raw retrieved snippet.
3. **Confidence.** `ConfidenceChip` shows a numeric and a one-line caveat. *"High · 92% — the v2 abstract explicitly references the open question in your goal."*
4. **What I will and won't do.** From `whatIWillDo`. *"I'll save this to your Library and draft a paragraph for your draft. I will not email anyone or change your goal."*

Every action that has consequences gets a `DryRunPreview` before execution: e.g. *"Save to library: 1 paper, 2 authors, 3 tags. Library size will go from 412 → 414 papers."*

Every action writes an `auditEntries` row with monospace timestamp, source channel (web / email / voice), and a JSON payload. The audit view at `/app/runs/[runId]` is a flat timeline.

`UndoBar` appears as a sticky footer for 24 hours after any reversible action; pressing undo writes a compensating action and audit entry.

## 10. Email loop (Mailgun)

**Outbound digest.** Triggered by the debounced `digestQueue` step. Sent from `please-reply@researchagents.io`. Subject: `Research Agents · {N} for you · {date}`. HTML + plain-text. Each card:

- Title, one-line context, priority chip (rendered as a colored prefix in plain text).
- A `View` deep link to `/app/briefings/{id}`.
- Three reply-action shortcuts at the end of the card: `Reply: approve {short-id}`, `Reply: dismiss {short-id}`, `Reply: more {short-id}`.
- A footer with the run-id, the per-briefing confidence, and an unsubscribe / preferences link.

Suppression: bounce/spam/unsubscribe events from `/api/mailgun/events` flip a per-user flag; the digest queue checks before sending.

**Inbound replies.** Mailgun routes mail addressed to `please-reply@researchagents.io` to `/api/mailgun/inbound`. Steps:

1. Verify HMAC signature (`MAILGUN_WEBHOOK_SIGNING_KEY`), reject otherwise.
2. Resolve sender to a `users` row by `email`. Reject unknown senders with a courteous bounce.
3. Strip the original quoted text. Take the first non-empty line.
4. Parse intent with a small deterministic regex first — `^(approve|dismiss|more|snooze)\s+([a-z0-9]{6,10})\b` — and if that fails, fall back to a one-shot Anthropic call (Haiku) with a constrained schema.
5. Look up briefing by short-id. Apply the action atomically. Reply back with a confirmation (`Got it — dismissed.`) including a deep link.

This is the only place where we run an LLM on inbound email content; the regex covers the 95% case.

## 11. Conversational surface

`/app/chat` is a streaming Anthropic Messages session.

- `system` includes a compact summary of the user's active goals, last 5 briefings, last 10 follows.
- `mcp_servers` includes the Valency MCP server with the user's token.
- A small set of internal tools (defined in code, executed server-side) is also exposed: `getBriefing(id)`, `getGoal(id)`, `listRecentBriefings({limit})`, `searchLibrary({query})`. These let the model talk about *the user's stuff*, not just arXiv.
- Every message renders the tool-use trace inline: a collapsed `Used semantic_search_papers · 1.2s · 14 results` row that expands to show the raw arguments and the trimmed response. This is the chat-side equivalent of the briefing's source list.
- Threads persist in `threads`/`messages`. Cost shown in a footer. Per-thread token ceiling enforced server-side.

Decision: **Anthropic Messages + MCP, not OpenClaw or Agent SDK.** Reasoning: the MCP integration is native, we control retries and cost ceilings precisely, and we already have an internal tool layer for our own database. The Agent SDK would be a fit only if we needed sub-agents inside the chat session, which we don't — sub-agents live in the offline pipeline (§7).

## 12. Topics & knowledge map

`/app/topics` — list of tags with counts and recency, filterable; clicking opens `/app/topics/[slug]` with a paginated feed of past briefings, papers, authors. Tags come from the Librarian agent.

`/app/map` — a force-directed graph using `cytoscape.js` (small, mature, lazy-loaded). Nodes: tags, papers, authors. Edges: `tag→paper`, `paper→author`, `author→author` (co-authorship from `find_coauthors`), `paper→paper` (citation from `get_citing_papers`). Click a node to filter the feed underneath; double-click an author to open their profile drawer. Initial render limited to the user's last 90 days of activity to keep the graph tractable.

Performance budget: graph render < 500ms for ≤500 nodes; degrade to a tag-list view above that with a "show all in map" CTA.

## 13. Phased build plan

Each phase is independently deploy-and-demo-able. Definition-of-done at the end of every phase requires:
- Production code only — **no placeholders, no mock data, no `TODO`s in shipped paths**. Test fixtures live in `tests/fixtures/`, never in runtime.
- Drizzle migration committed and applied to a clean dev DB.
- Vitest unit tests for new pure logic.
- Playwright integration test exercising the new user-visible surface end-to-end against a real Neon dev branch and the real Valency endpoint (with a per-test bearer token).
- `npm run build` clean, `npm run lint` clean, `npm run typecheck` clean.
- Deployed to a Vercel preview, smoke test passing.

### Phase 0 — Validation & spike (1–2 days)
**Goal.** Burn down unknowns before we touch the codebase.
**Deliverables.**
- 30-minute conversation each with 2 academic researchers (you have access to several). Validate the four researcher practices in §0; collect their actual goal phrasings.
- A standalone Node script in `scripts/spike/` that hits `https://labs.valency.io/mcp` with a bearer token and exercises 6 of the 37 endpoints, printing redacted responses. Confirms auth, latency, and JSON shapes.
- A second spike that calls Anthropic Messages with `mcp_servers: [{type:'url', url:'https://labs.valency.io/mcp', authorization_token: ...}]` and confirms tool use round-trips correctly. Records actual cost per Scout-shaped call so the budget knobs in §8 are real numbers.
**Definition of done.** Notes file in `docs/spike/` with measured latencies, costs, and any endpoint-shape surprises. No production code yet.

### Phase 1 — Foundation
**Goal.** A signed-in user lands on a deployed empty app at a Vercel URL.
**Deliverables.**
- `package.json`, `next.config.ts`, design tokens from §4 in `app/globals.css` via Tailwind v4 `@theme`, fonts wired.
- Auth.js v5 with Google provider, Drizzle adapter, sessions in Postgres.
- Drizzle setup: `drizzle.config.ts`, `db/schema.ts` with `users`, `sessions`. Migration applied.
- `/api/health`: pings DB, Anthropic models endpoint, Valency `/health`. Returns 200 with versions.
- `/` landing with Google sign-in. `/app` empty shell behind auth.
- CI: GitHub Actions workflow for lint + typecheck + unit tests + Playwright smoke.
- README updated with run instructions and the Vercel URL.
**Integration tests.** Playwright: sign-in flow with a Google test account; `/app` 401 redirects when signed out; `/api/health` returns 200.

### Phase 2 — Profile, goals, follows
**Goal.** A researcher can configure who they are and what they want briefed.
**Deliverables.**
- Onboarding flow (3 steps):
  1. **Identity** — name, affiliation, optional ORCID. ORCID resolves via Valency `resolve_orcid`; otherwise we fall back to `search_by_author` filtered by affiliation when present. Profile fields written to `users` and a row upserted into `authors`.
  2. **Research summary** — server fetches the researcher's papers from the corpus, then calls Anthropic (Opus 4.7) with `tool_use`-constrained output to summarize them as 3–5 candidate research goals (title, description, keywords, source paper IDs). User reviews, edits, and selects which to keep; selected candidates become `goals` rows with seeds derived from the keywords and source papers. Co-authors from `find_coauthors` are written to `follows` as suggested.
  3. **Cadence** — applied to every goal created during onboarding.
- Goals CRUD UI at `/app/goals`. A goal has title, free-text description, seeds (categories from `list_sources`/`identify_research_domains`, keywords, ORCIDs, paper IDs, venues), and a cadence.
- Follows UI on settings.
- `credentials` table; settings page collects the user's Valency bearer token, encrypts it, verifies via a cheap authenticated MCP call (`list_sources`), stores `lastVerifiedAt` and last4.
**Integration tests.** Playwright: create goal with 2 keyword seeds + 1 ORCID seed; identity step resolves ORCID and pre-fills; edit + delete; settings page accepts a real Valency token, verifies, and stores last4.

### Phase 3 — Valency MCP integration & call inspector
**Goal.** Server-side, deterministic Valency calls with full traceability.
**Deliverables.**
- `lib/valency/client.ts` — JSON-RPC client with bearer auth, structured logging, retry on 5xx with backoff, per-user request-rate limit.
- `lib/valency/tools.ts` — typed wrappers for all 37 endpoints with Zod schemas inferred from a small fixture-based contract test (calls each endpoint with a benign query in CI on a nightly schedule, gates on schema drift).
- `/app/runs/[runId]` skeleton — for now just renders Valency calls made by the user's "preview" button on a goal page.
- "Preview goal" button on `/app/goals/[id]`: runs Scout-shaped (deterministic, no LLM) queries against Valency for that goal's seeds and shows the raw 50-candidate list — proves the seed → results pipeline before we put an LLM on top of it.
**Integration tests.** Playwright: create a goal with a known-stable seed (e.g. category `cs.LG` last 7 days), click Preview, expect ≥1 paper. Vitest unit: every endpoint wrapper validates a recorded golden response.

### Phase 4 — Agent team
**Goal.** End-to-end run that produces real briefings in the database, no UI yet.
**Deliverables.**
- `lib/agents/{scout,analyst,librarian,editor}.ts` — each role's prompt + Zod output schema + Anthropic Messages caller with `mcp_servers` wired.
- `db/schema.ts` extended with `agentRuns`, `agentSteps`, `briefings`, `briefingSources`, `briefingProvenance`, `briefingTags`, `tags`, `papers`, `authors`, `goalSeeds`. Migrations applied.
- `lib/pipeline/runGoal.ts` — local-only orchestrator (not yet on Inngest) that runs the four steps in sequence with per-step persistence and the cost ceiling logic in §8.
- An admin-only CLI (`scripts/runGoal.ts`) that runs the pipeline for a given user+goal and prints the resulting briefings.
**Integration tests.** Vitest integration: run the full pipeline against a real Neon dev branch and the real Valency endpoint with a fixed seed; assert ≥3 briefings written, every briefing has ≥1 source row and a provenance row, costs recorded, no orphan rows. Schema-validation tests for each role.

### Phase 5 — Briefing feed & trust scaffolding (the Faros surface)
**Goal.** A signed-in user sees a real briefing feed at `/app` with working Explain and Sources.
**Deliverables.**
- `components/surface/HomeShell.tsx`, `Sidebar.tsx`, `BriefingCard.tsx`, `PriorityBadge.tsx`, `ConfidenceChip.tsx`, `ExplainButton.tsx`, `ShowSourcesLink.tsx`, `ExplainDrawer.tsx`, `SourcesPopover.tsx`, `QuickActions.tsx`, `InProgressPanel.tsx`, `AskAnything.tsx` (links to `/app/chat?q=`).
- Filter chips above the feed: All · Critical · In Process · Opportunities · Signals.
- `/app/briefings/[id]` detail page with the full Explain, sources, audit timeline (empty until Phase 6).
- All UI reads from real DB rows produced by Phase 4 — no mocks.
**Integration tests.** Playwright: seed Phase 4 pipeline run for a test user; load `/app`; assert all expected priorities render; click Explain → drawer shows reasoning, sources, confidence; click Show sources → popover lists ≥1 chip with the right ref id; tab to a chip → its detail loads.

### Phase 6 — Action loop & audit
**Goal.** Approve/dismiss/save/more-like-this all work, with audit and undo.
**Deliverables.**
- `/api/briefings/:id/action` — POST handler with idempotency key.
- Action panel on the card and on the briefing detail page; primary CTA varies per briefing kind (e.g. counter-evidence card → "Open in draft", citation card → "Save citation BibTeX" using `export_papers_bibtex`).
- `DryRunPreview.tsx` for actions that have side effects (save to library, fan-out to follows).
- `AuditTrail.tsx` on the briefing detail and `/app/runs/[runId]`.
- `UndoBar.tsx` sticky footer; 24-hour TTL enforced server-side.
- "More like this" → server creates a new derived goal with seeds extracted from the briefing's sources; the next pipeline run on that goal will surface a follow-up.
**Integration tests.** Playwright: approve, dismiss, save (verify library row), undo (verify compensating audit entry), more-like-this (verify new goal created with seeds linked to source papers).

### Phase 7 — Inngest runtime & cadence
**Goal.** Briefings happen automatically without anyone running the CLI.
**Deliverables.**
- Inngest setup, `/api/inngest` registry, all events from §8 wired.
- Per-goal cadence honored: `continuous` polls every 15 min, `daily` at 06:00 user-local, `weekly` Monday 06:00 user-local, `on_demand` only when manually triggered.
- Dedupe + cost ceiling in production paths.
- Run inspector at `/app/runs/[runId]` shows the full step trace including Inngest run-id deep-link to the Inngest dashboard.
**Integration tests.** Vitest with Inngest's local dev server: trigger `goal.run.requested`, assert all 7 steps execute in order, retries fire on a forced 5xx and succeed on the third try, dedupe drops a known-stale candidate. Playwright: change cadence in settings, observe the next-run-at chip update.

### Phase 8 — Email out (digests)
**Goal.** Briefings arrive in the researcher's inbox.
**Deliverables.**
- `lib/email/digest.tsx` — React Email components rendering the same card vocabulary as the web feed; HTML + auto-generated plain text.
- `lib/email/send.ts` — Mailgun client with retries, suppression-list enforcement.
- `/api/mailgun/events` — webhook for delivered/bounced/complained/opened/clicked. Signature verified.
- Footer: unsubscribe deep link, prefs deep link, run-id, "Reply with approve / dismiss / more <id>".
- Per-user `emailPrefs`: digest cadence (instant / hourly / daily / weekly / off), quiet hours.
**Integration tests.** Playwright + Mailgun sandbox domain: mark a test user with `instant`, run pipeline, assert a webhook event arrives (use a tunneled webhook receiver in CI), assert email contents match the web view.

### Phase 9 — Email in (replies → actions)
**Goal.** A reply to a digest does the right thing without the user opening the app.
**Deliverables.**
- `/api/mailgun/inbound` with HMAC verification, sender-to-user resolution, intent parser (regex first, Haiku fallback).
- Confirmation reply (`Got it — dismissed. View: <link>`); rejection reply for unknown senders.
- Recipient-allowlist test: never act on an email whose sender doesn't match a `users.email`.
- Audit entry per inbound action with `source: 'email'`.
**Integration tests.** Playwright: post a synthetic Mailgun-shaped payload (with a real signature) for `approve <id>`; assert the briefing flips to `approved`, audit entry written, confirmation email queued. Negative tests: bad HMAC → 401; unknown sender → polite-bounce reply, no DB mutation.

### Phase 10 — Conversational surface
**Goal.** The "Ask any question" input is real and useful.
**Deliverables.**
- `/app/chat` and `/app/chat/[threadId]` with streaming SSE.
- Tool-use trace renderer; raw arguments and trimmed responses behind a disclosure.
- System prompt assembly with the user's goals, recent briefings, and follows.
- Per-thread cost ceiling, per-user daily ceiling.
- Threads list, search, archive.
**Integration tests.** Playwright: ask "what new long-context papers cite my work this week?", assert the model calls at least one Valency tool (test mode logs tool names), assert the tool trace is rendered, assert a follow-up turn maintains thread state.

### Phase 11 — Topics & knowledge map
**Goal.** Researcher can browse what the agents have assembled.
**Deliverables.**
- `/app/topics` and `/app/topics/[slug]`.
- `/app/map` with cytoscape lazy-loaded; node click filters feed; double-click opens detail.
- Map performance guard rails per §12.
**Integration tests.** Playwright: a tag with ≥3 briefings shows them all on its slug page; map renders ≤500 nodes < 500ms (assert via a perf trace); node click filters feed.

### Phase 12 — Mobile + accessibility pass
**Goal.** Production-quality mobile web; passes WCAG AA on all screens.
**Deliverables.**
- Responsive rework: card stack, sidebar drawer, sheet for sources popover, full-width chat input.
- Touch targets ≥44px, focus rings visible, color-contrast passing AA.
- Keyboard nav for Explain drawer, sources popover, action panel.
- Screen-reader testing: VoiceOver iOS + Safari, TalkBack Android + Chrome.
- `prefers-reduced-motion` honored on drawer/transition animations.
**Integration tests.** Playwright on `viewport: 'iPhone 14'` and `'Pixel 7'`: full home + briefing-detail + chat journey.  axe-core run on every visited page in the Playwright suite, zero serious violations.

### Phase 13 — Production hardening
**Goal.** This is software you can leave running.
**Deliverables.**
- Sentry on web + edge + Inngest, with PII scrubbing and request-id correlation.
- Structured logs (one JSON line per request) shipped to Vercel + an external sink.
- Rate limits: per-user (token-bucket) on `/api/chat/stream`, `/api/briefings/:id/action`, and `/api/mailgun/inbound`.
- Anthropic spend dashboard at `/app/admin/spend` (admin-only).
- Backups: nightly pg_dump of Neon to S3, 30-day retention, restore runbook.
- Secret rotation runbook for all six secrets (Anthropic, Google, Mailgun, Mailgun signing, Neon, Inngest).
- A status page at `/status` driven by `/api/health` history.
**Integration tests.** Chaos test in CI: kill the Anthropic call mid-pipeline; assert Inngest retries cleanly and the audit shows the failure; the user sees nothing wrong.

### Phase 14 — End-to-end verification & launch
**Goal.** Sign-off.
**Deliverables.**
- A scripted Playwright user journey, ~3 minutes long: sign in → onboard with real ORCID → create 2 goals → wait for briefings (using a fast-forward Inngest helper in test mode) → read in app → reply approve via email → see audit → ask a chat question that triggers a Valency tool → save a paper → undo. Runs against a clean dev branch on every PR and against staging on every deploy.
- A reviewer script in the README that walks a human through the same flow in 5 minutes.
- Production Vercel deploy with `researchagents.io` (or chosen name) custom domain.
- A 30-day on-call rotation note in `RUNBOOK.md`: who to ping, what the common alarms are, how to roll back.

## 14. Voice (Phase 15+, post-MVP — captured here for design coherence)

Out of scope for v1, but the architecture should not preclude:

- Add a `phone_numbers` per-user, verified via SMS code.
- New event `briefing.created.voice_eligible` filtered by user prefs (e.g. only critical-priority).
- Outbound dial via Twilio + an Anthropic voice surface (or ElevenLabs TTS over a deterministic script if Anthropic voice isn't yet generally available at build time).
- Inbound voice replies use the same intent parser; speech-to-text via the same vendor.
- All voice events written to `auditEntries` with `source: 'voice'`.

The data model already accommodates this; no migrations required when we add it.

## 15. Non-goals (v1)

- No native iOS/Android apps; mobile web only.
- No team / lab / multi-tenant sharing — single-tenant, multi-user.
- No PDF parsing of paper bodies (we work from titles, abstracts, citations, and metadata).
- No paid-tier billing — internal use first, ceilings enforced via per-user budgets.
- No fine-tuning, no RAG over user-uploaded corpora.
- No browser extension.
- No training data flow back to Anthropic; opt-out preserved.

## 16. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Valency endpoint shape drifts under us | Nightly contract tests in CI per Phase 3; pin a `VALENCY_API_VERSION` if the project gains one. |
| Anthropic spend runaway | Per-user daily ceiling, per-step cost guard, Haiku fallback for non-Editor steps, weekly admin spend report. |
| Mailgun inbound spoofing | HMAC verification + sender-to-user lookup; never act on unknown senders; dry-run preview on destructive replies. |
| Briefing fatigue | Cap at 9/day/user, per-user "snooze" / "pause goal", "this is off-topic" feedback wired to Analyst's prior-briefings context. |
| Researcher distrust of agent confidence | Confidence chip is calibrated against an offline holdout: each phase, sample 20 briefings and have a researcher rate them; track Brier score over time. |
| Next.js version drift (per AGENTS.md) | Read `node_modules/next/dist/docs/` before touching anything Next-specific. Any deprecation notice is a hard stop. |

## 17. Open questions to resolve before Phase 1

These don't block writing the plan but should be settled before code:

1. **Valency token sourcing.** Do all users register at app.valency.io and paste a token, or do we need an OAuth-style flow with Valency? Confirm with `labs@valency.io`.
2. **Researcher sample.** Which 2 researchers will Phase 0 interview?
3. **Domain.** Buy `researchagents.io` before Phase 1 ships, so OAuth callbacks and email From-addresses don't need a re-stitch later.
4. **Suppression strategy.** If an academic email host is silently rate-limiting `please-reply@researchagents.io`, do we get a second send-from domain? Capture the threshold in `RUNBOOK.md`.
5. **ORCID privacy.** Some researchers have private ORCIDs; the onboarding flow must support skip-and-continue without breaking goal seeds.

---

## Appendix A — Sample briefing kinds

For Editor's structured output and the home-page filter chips:

- **`new_paper`** — *"Author Y · v1 yesterday · 0.91 match to your goal"*
- **`citation`** — *"3 papers this week cite your 2024 work on V"*
- **`trend`** — *"Usage of method M in cs.LG is up 38% YoY (95% CI ±6)"*
- **`collaborator`** — *"Dr. P at MIT has 2 papers adjacent to your goal; no co-authors in common"*
- **`counter_evidence`** — *"This v2 challenges the premise of your draft section 3"*
- **`venue`** — *"3 papers from your follows accepted at NeurIPS 2026"*
- **`method_shift`** — *"Half the papers in your category last week use a new dataset; it's not in your library"*
- **`funder`** — (Phase 2 — needs a funder source; arXiv comments give a weak signal)

## Appendix B — Confidence calibration

Editor outputs a 0–1 confidence per briefing. Bands:

- ≥0.90 — `High`
- 0.70–0.89 — `Medium`
- 0.50–0.69 — `Low`
- <0.50 — never surfaced; logged in `auditEntries` only

The chip text always pairs the band with a one-line caveat that names the *kind* of evidence (semantic match, citation count, abstract overlap, author identity match, …). No confidence is shown without a caveat — that's the trust contract.
