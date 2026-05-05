# Runbook — researchagents.io

Operational handbook for the deployed app. Update this whenever you add a
moving part.

## Architecture at a glance

- **Frontend + API**: Next.js on Vercel
- **Database**: Neon Postgres, Drizzle ORM
- **Background jobs**: Inngest Cloud
- **Email**: Mailgun (`researchagents.io` domain)
- **AI**: Anthropic Messages API (Claude Opus 4.7 / Haiku 4.5)
- **Tools**: Valency MCP at `https://labs.valency.io/mcp`
- **Observability**: Vercel logs (always), Sentry (when `SENTRY_DSN` set),
  status page at `/status`

---

## Backups

### Primary: Neon point-in-time-recovery (PITR)

Neon retains an editable history of the database for 7 days on the free tier
and longer on paid tiers. To restore:

1. Open <https://console.neon.tech>, pick the project, **Branches** tab.
2. Click **Create branch** with the timestamp you want.
3. Copy the new branch's `DATABASE_URL` and either point Vercel at it, or
   `pg_dump | psql` from it back into the main branch.

Document the timestamp in an incident ticket.

### Secondary: nightly `pg_dump` to S3

For longer retention (we want 30 days), run a nightly cron that does:

```bash
pg_dump --format=custom --compress=9 --no-owner --no-privileges \
  "$DATABASE_URL_UNPOOLED" \
  | aws s3 cp - "s3://valency-agents-backups/$(date +%Y-%m-%d).dump"
```

You can wire this as a GitHub Actions cron (`workflow_dispatch` + `schedule: '0 9 * * *'`), or
as an Inngest function on a 24h trigger. The S3 bucket needs:

- Versioning ON
- Lifecycle: delete objects older than 30d
- Encryption: SSE-S3 (or SSE-KMS if compliance demands)

### Restoring from `pg_dump`

```bash
aws s3 cp "s3://valency-agents-backups/YYYY-MM-DD.dump" - \
  | pg_restore --no-owner --no-privileges --clean --if-exists \
      -d "$NEW_DATABASE_URL"
```

Practice this once a quarter.

---

## Secret rotation

We rely on six secrets. Rotation procedure for each:

| Secret | Owner | Rotation cadence | Where it lives |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic Console | quarterly | Vercel env, `.vercel/.env.development.local` |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Google Cloud Console | yearly | Vercel env |
| `MAILGUN_API_KEY` | Mailgun → API Keys | quarterly | Vercel env |
| `MAILGUN_WEBHOOK_SIGNING_KEY` | Mailgun → Webhooks | yearly | Vercel env |
| `DATABASE_URL` (Neon) | Neon → Roles & Database | on incident | Vercel env (auto-managed by Vercel↔Neon integration) |
| `INNGEST_EVENT_KEY` / `_SIGNING_KEY` | Inngest dashboard | yearly | Vercel env |
| `AUTH_SECRET` | `openssl rand -hex 32` | on incident | Vercel env |
| `BRIEFING_ENC_KEY` | `openssl rand -hex 32` | **never** until you migrate stored creds | Vercel env |

### Procedure (applies to most)

1. Generate the new value in the upstream provider; **don't** invalidate the
   old one yet.
2. `vercel env rm OLD_KEY production preview` then
   `vercel env add NEW_KEY production preview` (paste new value).
3. `vercel --prod` to redeploy with the new key live.
4. Verify behavior:
   - Anthropic: `/api/health` reports `anthropic.ok=true`.
   - Mailgun: send a digest manually via `npm run run:goal` and check
     Mailgun's Logs UI.
   - Google: try sign-in.
5. Invalidate the old value in the provider.

### Special case: `BRIEFING_ENC_KEY`

Rotating this would orphan every existing user's stored Valency token (each
encrypted with the old key). If you must rotate, do it as a one-time
migration:

1. Generate `NEW_ENC_KEY`.
2. Add a column `credential.valency_token_cipher_v2`.
3. Run a script that decrypts each row with the old key and writes the
   re-encrypted value with the new key.
4. Swap env, deploy, drop the v1 column.

### Special case: `DATABASE_URL`

Vercel's Neon integration owns this. If you rotate manually, update
`DATABASE_URL` *and* `DATABASE_URL_UNPOOLED` in the same Vercel batch — the
unpooled URL is what `drizzle-kit migrate` reads.

---

## Common alarms

Wired in Sentry / Vercel / Inngest UI when those are configured:

- **`/api/health` 503** → DB or Anthropic or Valency is down. Check `/status`,
  pivot to the failing dependency's status page.
- **Inngest function failures** → Inngest UI tells you which step failed; the
  pipeline marks `agent_run.status='failed'` with `error_json`. The user sees
  nothing because retries are silent.
- **Anthropic spend spike** → check `/app/admin/spend`. The per-user daily
  ceiling auto-downgrades non-Editor agents to Haiku at 1× and hard-kills at
  2×. If you see 2× hits, lower the user's `daily_budget_usd` in Postgres.
- **Mailgun bounce / complaint** → the inbound webhook flips
  `users.email_suppressed`. The user sees a red banner on `/app/settings`
  with a "Resume" button.

## Rollback

1. `vercel rollback` on the dashboard, or
2. `vercel promote <previous-deployment-url>` from CLI

Rollback is safe at any time — schema migrations are additive and idempotent
in this codebase. No down-migration is required.

## On-call rotation

Single-person on-call for the first 30 days of production traffic. Pager
contact: Ben Clemens (ben.clemens@gmail.com).

Daily checklist (5 minutes):

1. `/status` — three components green
2. `/app/admin/spend` — yesterday's total reasonable
3. Vercel Functions tab — no recurring 5xx
4. Inngest UI — no functions stuck in "retrying"

If anything is red, follow the relevant alarm above and open an incident
ticket.
