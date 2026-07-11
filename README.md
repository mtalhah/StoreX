# Storex — Enterprise Warehouse Management Platform

A cloud-native, multi-tenant Warehouse Management System (WMS) built with
Next.js, Prisma, and WorkOS AuthKit, deployed on Google Cloud (Cloud Run +
Cloud SQL + BigQuery) with a Datastream CDC analytics pipeline.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui ·
AG Grid · Recharts · SWR · Prisma 7 · PostgreSQL · WorkOS AuthKit · BigQuery ·
Google Cloud Datastream · Cloud Run · Artifact Registry

---

## Table of contents

1. [System architecture](#system-architecture)
2. [Folder structure](#folder-structure)
3. [Database design](#database-design)
4. [Authentication flow](#authentication-flow)
5. [Authorization strategy](#authorization-strategy)
6. [Multi-tenant isolation](#multi-tenant-isolation)
7. [Analytics pipeline](#analytics-pipeline)
8. [REST API](#rest-api)
9. [Local development](#local-development)
10. [Deployment](#deployment)
11. [Environment variables](#environment-variables)
12. [Architectural decisions & trade-offs](#architectural-decisions--trade-offs)
13. [Future improvements](#future-improvements)

---

## System architecture

Clean Architecture with dependencies pointing inward only. Frameworks
(Next.js, Prisma, BigQuery SDK) live at the edges; business rules never
import them.

```
┌────────────────────────────────────────────────────────────────┐
│ Presentation      src/app, src/components                      │
│   Server Components (layout, guards) · Client islands          │
│   (AG Grid, Recharts, SWR) · proxy.ts session middleware       │
├────────────────────────────────────────────────────────────────┤
│ API               src/app/api/v1/*, src/lib/api                │
│   Thin route handlers: Zod parse → service call → envelope.    │
│   withApi() enforces auth + declared permission per endpoint.  │
├────────────────────────────────────────────────────────────────┤
│ Application       src/core/application                         │
│   Services (ALL business logic) · repository ports             │
│   (interfaces) · TenantContext · permission matrix             │
├────────────────────────────────────────────────────────────────┤
│ Domain            src/core/domain                              │
│   Entities · enums · domain errors. Zero framework imports.    │
├────────────────────────────────────────────────────────────────┤
│ Infrastructure    src/core/infrastructure                      │
│   Prisma repositories → Cloud SQL (OLTP)                       │
│   BigQuery repository → BigQuery (OLAP)                        │
│   WorkOS identity sync · composition root (container.ts)       │
└────────────────────────────────────────────────────────────────┘
         │                            │
   Cloud SQL (PostgreSQL) ──Datastream CDC──▶ BigQuery
   transactional truth                        analytics read model
```

Request lifecycle (API): `proxy.ts` verifies the WorkOS session cookie →
`withApi()` resolves the **TenantContext** (org, user, role, accessible
warehouse ids) and checks the endpoint's declared permission → a
request-scoped **service container** is built from that context → the service
re-checks permissions and applies business rules → repositories execute
queries that are structurally scoped to the tenant.

## Folder structure

```
├── prisma/                        # Schema, SQL migrations, seed
├── infra/
│   ├── analytics/                 # BigQuery view DDL + Datastream runbook
│   └── gcp/setup.sh               # One-time GCP provisioning
├── src/
│   ├── app/                       # Presentation: pages + route handlers
│   │   ├── (app)/                 # Authenticated shell (sidebar layout)
│   │   │   ├── dashboard/         #   BigQuery-backed KPI dashboard
│   │   │   ├── warehouses/ inventory/ movements/ users/
│   │   │   └── loading.tsx error.tsx not-found.tsx
│   │   ├── api/
│   │   │   ├── auth/callback/     #   WorkOS OAuth callback
│   │   │   └── v1/                #   REST API (versioned)
│   │   ├── page.tsx               #   Public landing
│   │   └── sign-in/
│   ├── core/
│   │   ├── domain/                # Entities, enums, errors
│   │   ├── application/
│   │   │   ├── auth/              # TenantContext + permission matrix
│   │   │   ├── ports/             # Repository interfaces
│   │   │   ├── services/          # Business logic (the only place)
│   │   │   └── dto/
│   │   └── infrastructure/
│   │       ├── db/                # Prisma client (pg driver adapter)
│   │       ├── repositories/      # Tenant-scoped Prisma repos
│   │       ├── analytics/         # BigQuery repo + Postgres dev fallback
│   │       └── container.ts       # Composition root
│   ├── components/                # UI (shadcn/ui + feature components)
│   ├── lib/
│   │   ├── api/                   # Envelope, withApi wrapper, Zod schemas
│   │   ├── auth/                  # Session → TenantContext, page guards
│   │   └── client/                # SWR hooks, typed fetch
│   └── proxy.ts                   # AuthKit session middleware (Next 16)
├── Dockerfile                     # Multi-stage, standalone output
├── cloudbuild.yaml                # Build → push → migrate → deploy
└── docker-compose.yml             # Local PostgreSQL
```

## Database design

Normalized OLTP schema for Cloud SQL PostgreSQL ([prisma/schema.prisma](prisma/schema.prisma)):

```
Organization 1──* User 1──* WarehouseAssignment *──1 Warehouse
Organization 1──* Warehouse 1──* InventoryItem 1──* StockMovement
                                        StockMovement *──1 User (createdBy)
```

| Table | Purpose | Key constraints |
| --- | --- | --- |
| `organizations` | Tenant root | unique `workosOrgId` |
| `users` | Members; linked to WorkOS on first sign-in | unique `(organizationId, email)`, unique `workosUserId` |
| `warehouses` | Name / location / capacity (storage units) | unique `(organizationId, name)`, `CHECK capacity > 0` |
| `warehouse_assignments` | Manager/operator access grants | PK `(userId, warehouseId)` |
| `inventory_items` | SKU stock + storage ratio per warehouse | unique `(warehouseId, sku)`, `CHECK quantity >= 0`, `CHECK storageUnitsPerItem > 0` |
| `stock_movements` | Immutable movement ledger | `CHECK quantity > 0`, FK `createdById` RESTRICT |

Design notes:

- **`organizationId` is denormalized** onto `inventory_items` and
  `stock_movements` (derivable via warehouse) so the repository layer can
  tenant-filter every query without joins and composite indexes stay cheap.
- **Quantity is a materialized aggregate.** Every change flows through
  `StockMovementService.record()`, which validates the business rules and
  delegates to a repository method that atomically inserts the movement and
  conditionally updates the quantity (`WHERE quantity >= :qty` for outbound)
  in one transaction — overselling is impossible even under concurrency, and
  the `CHECK` constraint is the final backstop.
- **Warehouse capacity model.** `warehouse.capacity` is a count of *storage
  units*, not items — a warehouse's used capacity is
  `sum(inventoryItem.quantity * inventoryItem.storageUnitsPerItem)`, so a
  pallet of hand trucks and a box of needles consume space proportional to
  how bulky they actually are, not how many of them there are.
  `storageUnitsPerItem` (`Decimal(12,6)`, not `Float`, to avoid binary
  floating-point drift when many fractional ratios are summed) is the
  canonical stored value. The create/edit UI and API also accept its
  inverse, `itemsPerStorageUnit` (e.g. "1000 needles per storage unit"),
  converting it via `storageUnitsPerItem = 1 / itemsPerStorageUnit` at the
  API boundary — the two are mutually exclusive on a single request. Every
  capacity check (inbound-movement rejection, capacity-reduction guard,
  dashboard utilization) is computed from this weighted sum, never from raw
  quantity.
- Movements are immutable; users with recorded movements can only be
  deactivated, never deleted (FK `RESTRICT` keeps the audit trail intact).
- Indexes match the read paths: `(organizationId, occurredAt DESC)`,
  `(warehouseId, occurredAt DESC)`, `(organizationId, sku)`, etc.

## Authentication flow

WorkOS AuthKit (hosted UI, sealed HTTP-only session cookies):

1. `src/proxy.ts` (`authkitProxy`) runs on every matched request: verifies /
   refreshes the session, redirects anonymous users to hosted sign-in.
2. WorkOS redirects back to `/api/auth/callback` (`handleAuth`), which seals
   the session into an encrypted cookie and forwards to `/dashboard`.
3. On the first authenticated request, `UserSyncService.resolveExisting()`
   maps the WorkOS identity to an internal user:
   - already linked (`workosUserId`) → normal sign-in;
   - **provisioned/invited by an admin** (email match, unlinked) → link
     identity → straight into their inviter's tenant;
   - unknown → resolves to `null`, and the app redirects to **`/onboarding`**
     (see below). Unknown users are never silently turned into a tenant.
4. `getTenantContext()` (memoized per request with React `cache()`) builds
   the TenantContext used by every layer. Deactivated users are rejected here.

### Admin onboarding

A first-time admin doesn't get an auto-guessed organization. Instead:

1. Admin signs in through WorkOS (authenticated, but no tenant yet).
2. `getTenantContext()` finds no internal user → redirects to `/onboarding`
   (a page deliberately **outside** the `(app)` route group, so the app
   layout's own redirect can't loop).
3. The admin enters a company name. The server action calls
   `UserSyncService.onboard()`, which **links to the WorkOS Organization on
   the session if present, otherwise creates one** (`WorkosAuthDirectory`,
   best-effort — onboarding still succeeds if the directory is unavailable,
   leaving `workosOrgId` null), then creates the tenant with the admin as its
   Admin. It is idempotent (a user invited in the meantime just resolves).
4. The admin invites managers/operators (provisioned by email). Those users
   authenticate through WorkOS and are linked by email on first sign-in — they
   never see the onboarding page.

## Authorization strategy

Three roles — `ADMIN`, `MANAGER` (Warehouse Manager), `OPERATOR` — mapped to
fine-grained permissions in one declarative table
([permissions.ts](src/core/application/auth/permissions.ts)). The model is
**separation of duties**: admins own the org structure and have read-only
visibility into operations; managers and operators run the day-to-day
inventory and stock movements.

| Permission | Admin | Manager | Operator |
| --- | :-: | :-: | :-: |
| users:manage / users:read | ✅ | — | — |
| warehouses:manage | ✅ | — | — |
| warehouses:read | ✅ | ✅ (assigned) | ✅ (own) |
| inventory:manage | — | ✅ (assigned) | ✅ (own) |
| inventory:read | ✅ | ✅ (assigned) | ✅ (own) |
| movements:create | — | ✅ (assigned) | ✅ (own) |
| movements:read | ✅ | ✅ (assigned) | ✅ (own) |
| analytics:read | ✅ (all) | ✅ (assigned) | ✅ (own) |

The **Warehouses section** (nav item + `/warehouses` page) is gated by a
separate rule, not a plain permission, because the Manager case depends on
assignment count (`canViewWarehousesSection`): admins always see it, a manager
sees it only when assigned to **more than one** warehouse (a single-warehouse
manager has nothing to switch between), and operators never do. All three
roles keep `warehouses:read` so the inventory/movements dropdowns can list
their own warehouses.

Analytics is warehouse-scoped by role: admins see the whole tenant, managers
see only their assigned warehouses, and operators see only their one warehouse
— the same `accessibleWarehouseIds` scope the OLTP repositories use.

Enforced at **three** levels — hiding UI is never the security boundary:

1. **API layer** — `withApi(permission, handler)` rejects before any handler
   code runs (401 unauthenticated, 403 unauthorized).
2. **Service layer** — every service method calls `authorize(ctx, permission)`
   again and owns invariants (operators have exactly one warehouse, managers
   at least one, admins none; you cannot change your own role or delete
   yourself).
3. **Repository layer** — structural scoping (next section), so even a buggy
   service cannot read or write outside the caller's scope.

## Multi-tenant isolation

The load-bearing rule: **repositories cannot be constructed without a
TenantContext, and every query they emit includes the tenant scope.**

- The composition root ([container.ts](src/core/infrastructure/container.ts))
  is the only way to obtain services/repositories, and it requires the
  context resolved from the verified session.
- Each repository derives a `scopedWhere` from the context: always
  `organizationId = ctx.organizationId`, plus
  `warehouseId IN ctx.accessibleWarehouseIds` for warehouse-scoped roles
  (Admins carry `null` = org-wide). Route handlers never write tenant
  filters — isolation is not a per-endpoint convention that can be forgotten.
- Writes use the same scoped `WHERE` (`updateMany`/`deleteMany` + guard),
  so cross-tenant ids cannot be mutated either.
- **Row creation is checked explicitly.** Unlike updates/deletes, an insert
  has no existing row to scope a `WHERE` against, so services that create a
  row referencing another tenant-scoped entity look it up first — e.g.
  `InventoryService.create()` calls `WarehouseRepository.findById()` before
  creating an `inventory_items` row, so a warehouse id from another
  organization (or outside an Admin's — deliberately unrestricted — scope
  check) can never end up paired with the caller's `organizationId`.
- Cross-tenant or out-of-scope lookups return **404, not 403** — no
  existence leakage.
- User-supplied filters (e.g. `?warehouseId=`) only narrow *within* the
  scope; requesting a foreign warehouse yields an empty page.
- The single deliberately unscoped repository
  ([identity-repository](src/core/application/ports/identity-repository.ts))
  exists only for the sign-in bootstrap and is unreachable from business
  services.
- BigQuery analytics queries are parameterized with the same
  organization + warehouse scope.

## Analytics pipeline

OLTP and OLAP are fully separated. The dashboard reads **exclusively from
BigQuery** through the `AnalyticsRepository` port.

```
Cloud SQL (Postgres) ──logical replication──▶ Datastream ──CDC merge──▶
BigQuery storex_raw (replica tables) ──SQL views──▶ storex_analytics
(dim_warehouse · fact_inventory_current · fact_stock_movement ·
agg_daily_warehouse_flows) ──parameterized queries──▶ /api/v1/analytics/*
```

- **Why Datastream:** managed serverless CDC, no application dual-writes to
  drift, backfills handled, freshness configurable (5 min here). Full
  trade-off table in [infra/analytics/datastream-setup.md](infra/analytics/datastream-setup.md).
- **Analytics schema ≠ OLTP mirror:** the app queries a small star-style
  read model (dimensions/facts/daily aggregate) defined in
  [create_analytics_views.sql](infra/analytics/create_analytics_views.sql).
  The `users` table is deliberately not replicated (no PII in the warehouse).
  `fact_inventory_current` precomputes `used_capacity` (`quantity *
  storage_units_per_item`) and `fact_stock_movement` precomputes
  `used_capacity_delta` per movement the same way, so every downstream
  query — on-hand/inbound/outbound KPIs, the inbound-vs-outbound trend
  chart, warehouse utilization — sums the same storage-weighted measure the
  OLTP side uses, never a raw quantity. The one KPI that stays a raw count
  is movement velocity (movement events
  per day, a cadence measure, not a volume).
- Metrics: stock levels, movement velocity, inbound-vs-outbound trend,
  warehouse utilization, inventory distribution, plus an **operational
  insight** per SKU (Low stock / Dead stock / Fast mover / Healthy) with
  thresholds shared between implementations
  ([analytics-thresholds.ts](src/core/application/analytics-thresholds.ts)).
- **Local development:** `ANALYTICS_SOURCE=postgres` swaps in a
  Postgres-backed implementation of the same port so the dashboard works
  without GCP. The container **refuses** this source in production.

## REST API

Versioned under `/api/v1`. Consistent envelope, Zod validation, pagination,
filtering, sorting:

```
GET/POST            /api/v1/warehouses          ?page&pageSize&sortBy&sortDir&search
GET/PATCH/DELETE    /api/v1/warehouses/:id
GET/POST            /api/v1/inventory           ?…&warehouseId
GET/PATCH/DELETE    /api/v1/inventory/:id
GET/POST            /api/v1/movements           ?…&warehouseId&type&from&to
GET/POST            /api/v1/users               ?…&role          (admin)
GET/PATCH/DELETE    /api/v1/users/:id                            (admin)
GET                 /api/v1/analytics/{kpis,trend,utilization,insights}
GET                 /api/v1/me
```

```jsonc
// success                                   // failure
{ "success": true,                           { "success": false,
  "data": [...],                               "error": {
  "meta": { "page": 1, "pageSize": 25,           "code": "INSUFFICIENT_STOCK",
            "totalItems": 128,                    "message": "Cannot move 50 units…",
            "totalPages": 6 } }                   "details": { … } } }
```

Domain error codes map to transport codes in one place: 400 validation,
401/403 auth, 404 not-found (incl. cross-tenant), 409 conflict/stock/capacity,
422 business-rule violation.

## Local development

Prereqs: Node 22+, Docker, a free [WorkOS](https://dashboard.workos.com) account.

```bash
npm install
docker compose up -d                  # local PostgreSQL 16
cp .env.example .env                  # fill in the WorkOS values
npx prisma migrate deploy && npx prisma db seed
npm run dev                           # http://localhost:3000
npm run smoke                         # exercises services/repos against the seeded DB
```

WorkOS dashboard setup (free tier): create an app → copy `WORKOS_API_KEY` and
`WORKOS_CLIENT_ID` → add redirect URI `http://localhost:3000/api/auth/callback`.

The seed creates the **Acme Logistics** demo tenant: 3 warehouses, 6 users,
~28 SKUs, and ~90 days of movement history. To sign in as a seeded role, set
`SEED_ADMIN_EMAIL` (and/or `SEED_MANAGER_EMAIL`, `SEED_OPERATOR_EMAIL`) to an
email you can authenticate with **before** seeding — first sign-in links the
WorkOS identity by email. Signing in with any other email lands on the
**onboarding** screen, where naming a company creates a fresh empty tenant
(you become its admin) — the quickest way to see tenant isolation.

## Deployment

```bash
# 1. One-time provisioning (APIs, Artifact Registry, Cloud SQL, BigQuery,
#    Secret Manager, IAM):
PROJECT_ID=my-project bash infra/gcp/setup.sh

# 2. Update the WorkOS secrets in Secret Manager with real values.

# 3. Build → push → migrate → deploy (Cloud Build):
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_REGION=europe-west1,_SQL_INSTANCE=my-project:europe-west1:storex-pg

# 4. Point the WorkOS redirect URI at https://<cloud-run-url>/api/auth/callback
#    and refresh the storex-workos-redirect-uri secret.

# 5. CDC pipeline: follow infra/analytics/datastream-setup.md
```

The [Dockerfile](Dockerfile) is a multi-stage build producing the Next.js
**standalone** output on `node:22-alpine`, running as a non-root user on
port 8080. Migrations run as a release step in Cloud Build (`prisma migrate
deploy`), never at container boot — Cloud Run instances must start fast and
must not race each other on schema changes.

## Environment variables

| Variable | Scope | Description |
| --- | --- | --- |
| `DATABASE_URL` | secret | Postgres connection string (Cloud SQL socket path in prod) |
| `WORKOS_API_KEY` | secret | WorkOS secret key |
| `WORKOS_CLIENT_ID` | secret | WorkOS client id |
| `WORKOS_COOKIE_PASSWORD` | secret | ≥32-char session cookie encryption key |
| `WORKOS_REDIRECT_URI` | config | Must match the WorkOS dashboard entry |
| `ANALYTICS_SOURCE` | config | `bigquery` (prod) · `postgres` (local dev only) |
| `GCP_PROJECT_ID` | config | BigQuery project |
| `BIGQUERY_DATASET` | config | Analytics dataset (default `storex_analytics`) |
| `SEED_*_EMAIL` | dev | Optional seed sign-in emails |

## Architectural decisions & trade-offs

1. **Tenant scoping in repository constructors** (vs. Postgres RLS, vs.
   per-query filters). Per-query filters are forgettable; RLS is the gold
   standard but couples policies to DB session state (`SET app.org_id`),
   complicating pooling and local DX. Constructor-injected scope gives
   compile-time-visible, testable isolation with one obvious place to audit.
   RLS remains a compatible *additional* hardening step (see below).
2. **Movement-driven quantities with a conditional atomic update.** The
   materialized `quantity` keeps reads O(1); correctness comes from the
   `UPDATE … WHERE quantity >= :qty` guard inside the movement transaction
   plus a DB `CHECK`. Trade-off: warehouse *capacity* — `requiredCapacity =
   quantity * item.storageUnitsPerItem` compared against the warehouse's
   summed `usedCapacity` — is checked pre-transaction (a concurrent inbound
   can overshoot slightly) — accepted to keep the hot write path free of
   serializable transactions; noted as a future advisory-lock improvement.
3. **`storageUnitsPerItem` computed in application code, not SQL
   aggregation.** Prisma's `groupBy`/`aggregate` can only sum a single
   column, not a per-row product like `quantity * storageUnitsPerItem`, so
   `PrismaWarehouseRepository.statsFor` and
   `PrismaInventoryRepository.usedCapacityInWarehouse` load the relevant rows
   and reduce in JS rather than reach for raw SQL. Accepted at this app's
   scale (a warehouse's SKU count is realistically in the hundreds); a
   `$queryRaw` `SUM(quantity * "storageUnitsPerItem")` would be the natural
   next step if that ever stops being true. The BigQuery side has no such
   constraint — `used_capacity` is precomputed in the `fact_inventory_current`
   view.
4. **Dual input mode for the storage ratio, converted at the API boundary.**
   The UI/API accept either `storageUnitsPerItem` or its inverse
   `itemsPerStorageUnit` (mutually exclusive on one request) because
   operators naturally think in whichever direction fits the SKU — "1000
   needles per storage unit" is more legible than "0.001 storage units per
   needle." `resolveStorageUnitsPerItem()` in `lib/api/schemas.ts` performs
   the conversion before the value reaches any service, so services and
   repositories only ever see the canonical value and never need to know the
   input mode existed.
5. **Datastream CDC over dual-writes/batch ELT** — see
   [the runbook](infra/analytics/datastream-setup.md). Accepted cost:
   minutes-level dashboard staleness.
6. **Swappable analytics port with a dev-only Postgres implementation.**
   Keeps the "dashboard reads only BigQuery" production rule (enforced in the
   container) without making local development depend on a GCP project.
7. **Self-serve org creation on unknown sign-in.** Demonstrates tenant
   provisioning without an ops step; a real deployment might gate this behind
   invitations or WorkOS Organizations + SSO per tenant.
8. **Server-driven pagination/sorting with AG Grid as the renderer** rather
   than AG Grid's client-side model — the API stays the source of truth and
   the pattern scales past in-memory datasets.
9. **Prisma 7 with the pg driver adapter** — no Rust query engine binary,
   smaller Cloud Run images, first-class TS client.

## Future improvements

- **Postgres RLS** as defense-in-depth beneath the repository scoping.
- **Idempotency keys** on `POST /movements` for safe client retries.
- **Cursor-based pagination** for the movements ledger at scale.
- **Warehouse capacity under advisory locks** to close the concurrent-inbound
  overshoot window.
- **WorkOS Organizations + SSO/SCIM** per tenant (enterprise IdP onboarding),
  org switcher for multi-org membership.
- **Materialized BigQuery aggregates + BI Engine** when dashboard volume grows.
- **Audit log table** for administrative actions (user/warehouse changes).
- **Unit/integration test suites** (service-layer rules, repository scoping
  against a disposable Postgres, API contract tests) wired into Cloud Build.
- **Observability**: structured request logging, OpenTelemetry traces to
  Cloud Trace, SLO dashboards.
