# Running Storex locally

A step-by-step guide to get Storex running on your machine. For the full
architecture, see [README.md](README.md).

## 1. Prerequisites

- **Node.js 22+**
- **Docker** (for local PostgreSQL)
- A free **[WorkOS](https://dashboard.workos.com)** account

## 2. Install dependencies

```bash
npm install
```

## 3. Start the database

```bash
docker compose up -d
```

This starts PostgreSQL 16 in a container, exposed on **host port 5433** (not
the default 5432, so it won't clash with any Postgres already running on your
machine). Data persists in a named Docker volume across restarts.

## 4. Create your `.env`

```bash
cp .env.example .env
```

Then fill in / adjust these values:

| Variable | What to put |
| --- | --- |
| `DATABASE_URL` | `postgresql://storex:storex@localhost:5433/storex?schema=public` (already correct for the compose setup above) |
| `WORKOS_API_KEY` | From your WorkOS dashboard — see step 5 |
| `WORKOS_CLIENT_ID` | From your WorkOS dashboard — see step 5 |
| `WORKOS_COOKIE_PASSWORD` | Any random string, 32+ characters. Generate one with `openssl rand -base64 32` |
| `WORKOS_REDIRECT_URI` | Leave as `http://localhost:3000/api/auth/callback` |
| `ANALYTICS_SOURCE` | **Change this to `postgres`** — the default `bigquery` requires a real GCP project and will crash the dashboard locally |
| `GCP_PROJECT_ID`, `BIGQUERY_DATASET` | Leave blank; unused when `ANALYTICS_SOURCE=postgres` |

## 5. Set up WorkOS (free tier)

1. Create an account/app at [dashboard.workos.com](https://dashboard.workos.com).
2. Copy the **API Key** and **Client ID** into `.env`.
3. In the dashboard, add a redirect URI: `http://localhost:3000/api/auth/callback`.

That's all that's required — you do **not** need to configure WorkOS
Organization Roles or SSO for local development.

## 6. Run migrations and seed the database

```bash
npx prisma migrate deploy
npx prisma db seed
```

This creates two demo tenants:

- **PVP Logistics** — 3 warehouses, an admin/manager/operator, ~90 days of
  stock-movement history.
- **Majestic Electronics** — 2 warehouses (one intentionally unstocked), an
  admin/operator.

The sign-in emails for each seeded user are hardcoded in
[prisma/seed.ts](prisma/seed.ts) (see the `pvpSeed`/`majesticSeed` objects
near the top of the file) — you'll need a WorkOS account under one of those
addresses to sign in as that seeded user and see pre-populated data.

**Don't have access to those emails?** Sign in with any other email instead —
you'll land on the **onboarding** screen, where naming a company creates a
brand-new, empty tenant with you as its admin. That's the fastest way to
explore the app (you just won't have seed data to look at).

## 7. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in through
WorkOS.

## 8. (Optional) Run the smoke test

```bash
npm run smoke
```

Exercises the real services/repositories against your seeded database —
authorization, tenant scoping, and stock-movement invariants. No UI or
running dev server required.

## Troubleshooting

- **Dashboard throws `GCP_PROJECT_ID must be set when ANALYTICS_SOURCE=bigquery`**
  — you missed step 4; set `ANALYTICS_SOURCE=postgres` in `.env` and restart
  `npm run dev`.
- **Docker port 5433 already in use** — stop whatever's bound to it, or edit
  the host port in `docker-compose.yml` and update `DATABASE_URL` to match.
- **Redirected in a loop / sign-in fails** — double check the redirect URI in
  the WorkOS dashboard is *exactly* `http://localhost:3000/api/auth/callback`,
  matching `WORKOS_REDIRECT_URI` in `.env`.
- **Signed in but landed on `/onboarding` instead of a seeded tenant** —
  you're signed in with an email that isn't one of the hardcoded seed emails
  in `prisma/seed.ts`; either use one of those emails or continue with your
  own fresh tenant.

## Useful scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run smoke` | Run the service/repository smoke test |
| `npm run db:studio` | Open Prisma Studio (browse the local database) |
| `npm run db:migrate` | Create a new migration during schema changes |
| `npm run db:seed` | Re-run the seed (wipes and recreates the two demo tenants) |
| `npm run typecheck` | Run `tsc --noEmit` |
| `npm run lint` | Run ESLint |
