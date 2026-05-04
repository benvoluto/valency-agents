# valency-agents

A Next.js + Vercel app that puts a small team of Claude (Opus) agents in front
of an academic researcher and uses the [Valency](https://labs.valency.io) MCP
server to push 3–9 high-signal proposals per day.

See [`PROJECT.md`](./PROJECT.md) for the full plan and phased roadmap.

## Getting started

Requires Node (the version pinned in `.nvmrc`), an account on Vercel, Neon,
Anthropic, Google Cloud (OAuth client), and Valency.

```bash
nvm use                      # picks up .nvmrc
npm install
vercel link                  # links this repo to the Vercel project
vercel env pull .vercel/.env.development.local
npm run db:migrate
npm run dev
```

Or, without Vercel, copy `.env.example` to `.env.local` and fill in the
secrets manually. `AUTH_SECRET` can be generated with `openssl rand -hex 32`.

## Scripts

| Script                | What it does                                       |
| --------------------- | -------------------------------------------------- |
| `npm run dev`         | Next.js dev server on `localhost:3000`             |
| `npm run build`       | Production build                                   |
| `npm run start`       | Serve the production build                         |
| `npm run lint`        | ESLint (flat config)                               |
| `npm run typecheck`   | `tsc --noEmit`                                     |
| `npm run test`        | Vitest unit tests                                  |
| `npm run test:e2e`    | Playwright integration tests                       |
| `npm run db:generate` | Generate a new Drizzle migration from schema diff  |
| `npm run db:migrate`  | Apply pending migrations to `DATABASE_URL`         |
| `npm run db:studio`   | Drizzle Studio against the configured DB           |

## Routes today

- `/` — landing page with Google sign-in.
- `/app` — signed-in shell (auth-gated by `middleware.ts`).
- `/api/auth/[...nextauth]` — Auth.js handlers.
- `/api/health` — JSON health check across DB, Anthropic, and Valency.

Future routes are enumerated in `PROJECT.md` §5.

## Architecture

See `PROJECT.md` §2 for the architecture diagram. Phase 1 covers the boxed
"Next.js on Vercel" + "Auth.js v5" + "Neon Postgres (Drizzle ORM)" portions of
that diagram. Inngest, Mailgun, and the agent team land in later phases.
