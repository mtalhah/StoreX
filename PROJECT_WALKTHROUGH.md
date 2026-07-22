# StoreX — End-to-End Project Walkthrough

> A complete technical tour of the codebase: architecture, data model,
> authentication/authorization, every user-facing workflow traced file by
> file, the analytics pipeline, and deployment. Written as a companion to
> [README.md](README.md) (which is the canonical high-level reference) — this
> document goes one level deeper, with actual code excerpts and exact file
> paths, for onboarding someone who wants to hold the whole system in their
> head.

---

## Table of contents

1. [What StoreX is](#1-what-storex-is)
2. [Tech stack](#2-tech-stack)
3. [Project structure](#3-project-structure)
4. [Layered architecture](#4-layered-architecture)
5. [Domain model](#5-domain-model)
6. [Database schema](#6-database-schema)
7. [Authentication & the TenantContext](#7-authentication--the-tenantcontext)
8. [Authorization: the permission matrix](#8-authorization-the-permission-matrix)
9. [Multi-tenant isolation mechanics](#9-multi-tenant-isolation-mechanics)
10. [The API envelope & error model](#10-the-api-envelope--error-model)
11. [Every workflow, traced end to end](#11-every-workflow-traced-end-to-end)
    - [11.1 Sign-in & session resolution](#111-sign-in--session-resolution)
    - [11.2 Admin onboarding (new tenant creation)](#112-admin-onboarding-new-tenant-creation)
    - [11.3 User invitation](#113-user-invitation)
    - [11.4 User management (update/deactivate)](#114-user-management-updatedeactivate)
    - [11.5 Warehouse CRUD](#115-warehouse-crud)
    - [11.6 Inventory item CRUD](#116-inventory-item-crud)
    - [11.7 Record a stock movement](#117-record-a-stock-movement)
    - [11.8 Edit / delete a stock movement](#118-edit--delete-a-stock-movement)
    - [11.9 Dashboard analytics](#119-dashboard-analytics)
    - [11.10 The list-page pattern (shared by 4 workflows)](#1110-the-list-page-pattern-shared-by-4-workflows)
11. [REST API reference](#12-rest-api-reference)
12. [Analytics pipeline (BigQuery/Datastream)](#13-analytics-pipeline-bigquerydatastream)
13. [Frontend architecture](#14-frontend-architecture)
14. [Local development](#15-local-development)
15. [Deployment](#16-deployment)
16. [Environment variables](#17-environment-variables)
17. [Architectural decisions & trade-offs](#18-architectural-decisions--trade-offs)
18. [Known gaps / future work](#19-known-gaps--future-work)
19. [Current project state (point-in-time)](#20-current-project-state-point-in-time)

---

## 1. What StoreX is

StoreX is a **multi-tenant Warehouse Management System (WMS)** — a SaaS
product where multiple independent companies ("organizations") each manage
their own warehouses, inventory (SKUs), stock movements (inbound/outbound),
and staff, fully isolated from one another. Three roles exist inside a
tenant: **Admin** (owns org structure, read-only on operations), **Manager**
(runs operations for one or more warehouses, can correct mistakes), and
**Operator** (runs operations for exactly one warehouse).

It's built as a "production-quality assessment" project: Clean Architecture
throughout, structural (not conventional) tenant isolation, an atomic
concurrency-safe stock ledger, a real OLTP/OLAP split (Postgres for writes,
BigQuery for the dashboard), and a real third-party auth provider (WorkOS)
rather than a rolled-your-own auth system.

## 2. Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, "proxy" middleware — a Next 16 rename of `middleware.ts`) |
| Language | TypeScript |
| Styling / UI kit | Tailwind CSS 4, shadcn/ui — **built on Base UI, not Radix** (see gotchas below) |
| Data grid | AG Grid (community) — server-driven pagination, not client-side |
| Charts | Recharts |
| Data fetching | SWR |
| Validation | Zod v4 |
| ORM | Prisma 7 (`prisma-client` generator, `@prisma/adapter-pg` driver adapter — no Rust query-engine binary) |
| Database (OLTP) | PostgreSQL (Cloud SQL in prod, Docker locally on port `5433`) |
| Analytics (OLAP) | Google BigQuery, fed by **Datastream** CDC from Cloud SQL |
| Auth | WorkOS AuthKit (hosted UI, sealed HTTP-only session cookies) |
| Hosting | Google Cloud Run (Dockerfile, standalone Next.js output) |
| CI/build | Cloud Build (`cloudbuild.yaml`) |

## 3. Project structure

```
StoreX/
├── prisma/
│   ├── schema.prisma              # OLTP schema (source of truth for Postgres)
│   ├── migrations/                # SQL migration history
│   └── seed.ts                    # Seeds 2 real tenants with ~90 days of movement history
├── infra/
│   ├── analytics/
│   │   ├── create_analytics_views.sql   # BigQuery star-schema views over Datastream replica tables
│   │   └── datastream-setup.md          # CDC pipeline runbook
│   └── gcp/setup.sh               # One-time GCP provisioning (APIs, Artifact Registry, Cloud SQL, BigQuery, Secret Manager, IAM)
├── scripts/
│   └── smoke-test.ts              # `npm run smoke` — exercises services/repos against the seeded DB
├── src/
│   ├── app/                                   # PRESENTATION: pages + route handlers
│   │   ├── (app)/                             # Authenticated shell (route group — has its own layout.tsx)
│   │   │   ├── layout.tsx                     #   Resolves TenantContext, builds role-filtered nav
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── warehouses/page.tsx
│   │   │   ├── inventory/page.tsx
│   │   │   ├── movements/page.tsx
│   │   │   ├── users/page.tsx
│   │   │   ├── loading.tsx, error.tsx, not-found.tsx
│   │   ├── onboarding/                        # OUTSIDE (app) — see §11.2 for why
│   │   │   ├── page.tsx, onboarding-form.tsx, actions.ts
│   │   ├── api/
│   │   │   ├── auth/callback/route.ts         # WorkOS OAuth callback
│   │   │   └── v1/                            # REST API (versioned)
│   │   │       ├── warehouses/{route.ts,[id]/route.ts}
│   │   │       ├── inventory/{route.ts,[id]/route.ts}
│   │   │       ├── movements/{route.ts,[id]/route.ts}
│   │   │       ├── users/{route.ts,[id]/route.ts}
│   │   │       ├── analytics/{kpis,trend,utilization,insights}/route.ts
│   │   │       └── me/route.ts
│   │   ├── page.tsx                           # Public landing page
│   │   └── sign-in/route.ts                   # Triggers WorkOS hosted sign-in (route handler, not a page — see §11.1 gotcha)
│   ├── core/
│   │   ├── domain/                            # DOMAIN: zero framework imports
│   │   │   ├── entities.ts                    #   Plain data shapes (Organization, User, Warehouse, InventoryItem, StockMovement)
│   │   │   ├── enums.ts                       #   UserRole, MovementType, InvitationStatus
│   │   │   └── errors.ts                      #   DomainError hierarchy with machine-readable codes
│   │   ├── application/                       # APPLICATION: the only place business logic lives
│   │   │   ├── auth/
│   │   │   │   ├── tenant-context.ts          #   TenantContext type + canAccessWarehouse()
│   │   │   │   └── permissions.ts             #   Permission enum, ROLE_PERMISSIONS matrix, authorize()
│   │   │   ├── ports/                         #   Repository interfaces (dependency inversion)
│   │   │   │   ├── warehouse-repository.ts, inventory-repository.ts, stock-movement-repository.ts
│   │   │   │   ├── user-repository.ts, identity-repository.ts, auth-directory.ts, analytics-repository.ts
│   │   │   ├── services/                      #   ALL business logic
│   │   │   │   ├── warehouse-service.ts, inventory-service.ts, stock-movement-service.ts
│   │   │   │   ├── user-service.ts, user-sync-service.ts, analytics-service.ts
│   │   │   ├── analytics-thresholds.ts        #   Shared LOW_STOCK/DEAD_STOCK/FAST_MOVER thresholds (both analytics impls)
│   │   │   └── dto/common.ts                  #   Paginated<T> etc.
│   │   └── infrastructure/                    # INFRASTRUCTURE: frameworks live here
│   │       ├── db/prisma.ts                   #   PrismaClient singleton (pg driver adapter)
│   │       ├── repositories/                  #   Tenant-scoped Prisma repos (one per port)
│   │       │   ├── prisma-warehouse-repository.ts, prisma-inventory-repository.ts
│   │       │   ├── prisma-stock-movement-repository.ts, prisma-user-repository.ts
│   │       │   ├── prisma-identity-repository.ts, prisma-errors.ts
│   │       ├── analytics/
│   │       │   ├── bigquery-analytics-repository.ts    # production
│   │       │   ├── postgres-analytics-repository.ts    # local-dev-only fallback
│   │       │   └── bigquery.ts                          # BigQuery client factory
│   │       ├── auth/workos-auth-directory.ts  #   WorkOS Organizations/invitations wrapper
│   │       └── container.ts                   #   COMPOSITION ROOT — the only way to get a Services bundle
│   ├── components/
│   │   ├── ui/                                # shadcn/ui primitives (Base UI under the hood)
│   │   ├── layout/{app-shell,sidebar-nav,user-menu}.tsx
│   │   ├── dashboard/{dashboard-view,trend-chart,utilization-panel,insights-grid}.tsx
│   │   ├── warehouses/warehouse-dialog.tsx
│   │   ├── inventory/inventory-item-dialog.tsx
│   │   ├── movements/{record-movement-dialog,edit-movement-dialog}.tsx
│   │   ├── data-grid.tsx, kpi-card.tsx, page-header.tsx, confirm-dialog.tsx
│   └── lib/
│       ├── api/{handler.ts,response.ts,schemas.ts}    # withApi(), envelope, Zod schemas
│       ├── auth/{session.ts,guards.ts,actions.ts,urls.ts}
│       ├── client/{api.ts,use-paginated.ts,use-me.ts,use-warehouse-options.ts,types.ts,validation.ts}
│       └── format.ts, utils.ts
├── src/proxy.ts                   # AuthKit session middleware (Next 16's middleware.ts equivalent)
├── src/generated/prisma/          # Prisma 7 generated client (checked-in path, not node_modules)
├── Dockerfile                     # Multi-stage, standalone Next.js output
├── cloudbuild.yaml                # Build → push → migrate → deploy
├── docker-compose.yml             # Local Postgres only (app runs via `npm run dev`)
├── prisma.config.ts               # Prisma 7 config (schema.prisma no longer holds the connection URL)
└── README.md, LOCALSETUP.md       # High-level reference / step-by-step local setup
```

## 4. Layered architecture

Dependencies point **inward only**. A quick way to audit any file: domain
imports nothing of ours; application imports only domain + its own ports;
infrastructure imports application ports (to implement them) plus real SDKs
(Prisma, BigQuery, WorkOS); presentation imports application services (via
the container) and infrastructure only through that same container.

```
┌────────────────────────────────────────────────────────────────┐
│ Presentation      src/app, src/components                      │
│   Server Components (layout, guards) · Client islands          │
│   (AG Grid, Recharts, SWR) · proxy.ts session middleware        │
├────────────────────────────────────────────────────────────────┤
│ API               src/app/api/v1/*, src/lib/api                │
│   Thin route handlers: Zod parse → service call → envelope.    │
│   withApi() enforces auth + declared permission per endpoint.  │
├────────────────────────────────────────────────────────────────┤
│ Application       src/core/application                         │
│   Services (ALL business logic) · repository ports             │
│   (interfaces) · TenantContext · permission matrix             │
├────────────────────────────────────────────────────────────────┤
│ Domain            src/core/domain                               │
│   Entities · enums · domain errors. Zero framework imports.    │
├────────────────────────────────────────────────────────────────┤
│ Infrastructure    src/core/infrastructure                       │
│   Prisma repositories → Cloud SQL (OLTP)                       │
│   BigQuery repository → BigQuery (OLAP)                        │
│   WorkOS identity sync · composition root (container.ts)       │
└────────────────────────────────────────────────────────────────┘
```

**Request lifecycle, one sentence:** `proxy.ts` verifies the WorkOS session
cookie → `withApi()` resolves the `TenantContext` and checks the endpoint's
declared permission → a request-scoped service container is built from that
context → the service re-checks permissions and applies business rules →
repositories execute queries that are structurally scoped to the tenant.

## 5. Domain model

**[src/core/domain/enums.ts](src/core/domain/enums.ts)**
```ts
export const USER_ROLES = ['ADMIN', 'MANAGER', 'OPERATOR'] as const;
export const MOVEMENT_TYPES = ['INBOUND', 'OUTBOUND'] as const;
export const INVITATION_STATUSES = ['PENDING', 'ACCEPTED', 'SKIPPED'] as const;
```
Values intentionally match the Prisma enums so infrastructure can map without
lookup tables, but domain never imports generated Prisma code.

**[src/core/domain/entities.ts](src/core/domain/entities.ts)** — plain interfaces, no
persistence concerns: `Organization`, `User`, `Warehouse`, `InventoryItem`,
`StockMovement`.

**[src/core/domain/errors.ts](src/core/domain/errors.ts)** — a `DomainError`
abstract base with a machine-readable `code`; the API layer (not the domain)
owns the code → HTTP-status mapping:

| Error class | code | HTTP |
|---|---|---|
| `ValidationError` | `VALIDATION_ERROR` | 400 |
| `UnauthorizedError` | `UNAUTHORIZED` | 401 |
| `ForbiddenError` | `FORBIDDEN` | 403 |
| `NotFoundError` | `NOT_FOUND` | 404 |
| `ConflictError` | `CONFLICT` | 409 |
| `InsufficientStockError` | `INSUFFICIENT_STOCK` | 409 |
| `CapacityExceededError` | `CAPACITY_EXCEEDED` | 409 |
| `BusinessRuleViolationError` | `BUSINESS_RULE_VIOLATION` | 422 |

`NotFoundError` is deliberately also thrown for cross-tenant / out-of-scope
lookups — "exists but not yours" and "doesn't exist" are indistinguishable to
the caller, so no existence leaks across tenants.

## 6. Database schema

**[prisma/schema.prisma](prisma/schema.prisma)** — normalized OLTP schema:

```
Organization 1──* User 1──* WarehouseAssignment *──1 Warehouse
Organization 1──* Warehouse 1──* InventoryItem 1──* StockMovement
                                        StockMovement *──1 User (createdBy)
```

| Table | Purpose | Key constraints |
|---|---|---|
| `organizations` | Tenant root | unique `workosOrgId` (nullable — self-serve orgs may not have one yet) |
| `users` | Members; linked to WorkOS on first sign-in | unique `(organizationId, email)`, unique `workosUserId`; `workosInvitationId`/`invitationStatus`/`invitedAt` all nullable (null = outside invite flow) |
| `warehouses` | Name/location/capacity (storage units, not item count) | unique `(organizationId, name)`, `CHECK capacity > 0` |
| `warehouse_assignments` | Manager/operator access grants | PK `(userId, warehouseId)` |
| `inventory_items` | SKU stock + storage ratio per warehouse | unique `(warehouseId, sku)`, `CHECK quantity >= 0`, `CHECK storageUnitsPerItem > 0` |
| `stock_movements` | Immutable-by-default movement ledger | `CHECK quantity > 0`, FK `createdById` **RESTRICT** (can't delete a user with movement history) |

Design notes worth internalizing:

- **`organizationId` is denormalized** onto `inventory_items` and
  `stock_movements` (derivable via warehouse) purely so the repository layer
  can tenant-filter every query without joins.
- **`quantity` is a materialized aggregate.** It is never written directly —
  every change flows through `StockMovementService`, which validates business
  rules and delegates to a repository method that atomically inserts the
  movement row and conditionally updates the quantity in one transaction (see
  §11.7). Overselling is structurally impossible even under concurrency; the
  `CHECK` constraint is the final backstop.
- **Warehouse capacity is a *space* measure, not an item count.** A
  warehouse's used capacity is
  `sum(inventoryItem.quantity * inventoryItem.storageUnitsPerItem)` — a
  pallet of hand trucks and a box of needles consume space proportional to
  how bulky they actually are. `storageUnitsPerItem` is `Decimal(12,6)`
  (never `Float`) specifically to avoid binary floating-point drift when many
  fractional ratios get summed. The UI/API also accept the inverse,
  `itemsPerStorageUnit` (e.g. "1000 needles per storage unit"), converted at
  the API boundary by `resolveStorageUnitsPerItem()` in
  [lib/api/schemas.ts](src/lib/api/schemas.ts) — services/repositories only
  ever see the canonical value.
- Movements are immutable to everyone **except** a Manager correcting a
  mistake (`movements:manage` — quantity/note only, never type/item/
  warehouse). Users with recorded movements can only be deactivated, never
  deleted.
- Indexes match the read paths: `(organizationId, occurredAt DESC)`,
  `(warehouseId, occurredAt DESC)`, `(organizationId, sku)`, etc.

## 7. Authentication & the TenantContext

Auth uses **WorkOS AuthKit**: hosted sign-in UI, sealed HTTP-only session
cookies, no passwords or sessions handled by StoreX itself.

The single object every layer above infrastructure trusts is the
**TenantContext** ([src/core/application/auth/tenant-context.ts](src/core/application/auth/tenant-context.ts)):

```ts
export interface TenantContext {
  organizationId: string;
  userId: string;              // internal id, not WorkOS id
  email: string;
  role: UserRole;
  workosUserId: string | null;
  accessibleWarehouseIds: string[] | null;  // null = unrestricted (Admin)
}
```

It's produced once per request (`session.ts`, memoized with React `cache()`)
and threaded through `container.ts` into every repository constructor — see
§11.1 for the full resolution trace.

## 8. Authorization: the permission matrix

**[src/core/application/auth/permissions.ts](src/core/application/auth/permissions.ts)**
is one declarative table — a **separation-of-duties** model, not a simple
hierarchy:

| Permission | Admin | Manager | Operator |
|---|:-:|:-:|:-:|
| `users:manage` / `users:read` | ✅ | — | — |
| `warehouses:manage` | ✅ | — | — |
| `warehouses:read` | ✅ | ✅ (assigned) | ✅ (own) |
| `inventory:manage` | — | ✅ (assigned) | ✅ (own) |
| `inventory:read` | ✅ | ✅ (assigned) | ✅ (own) |
| `movements:create` | — | ✅ (assigned) | ✅ (own) |
| `movements:read` | ✅ | ✅ (assigned) | ✅ (own) |
| `movements:manage` (edit/delete) | — | ✅ (assigned) | — |
| `analytics:read` | ✅ (all) | ✅ (assigned) | ✅ (own) |

Notable asymmetries (both deliberate, both worth remembering if you're
extending the roles):
- **Admin is read-only on operations.** Admins own org structure (users,
  warehouses) but never touch inventory or record movements themselves.
- **`movements:manage` is Manager-only**, not shared with Operator, even
  though Manager and Operator are otherwise identical permission sets. An
  Operator's mistake needs a Manager to fix it; Operators can create new
  movements but never rewrite history.
- **The Warehouses *section* (nav item + `/warehouses` page) is not a plain
  permission** — `canViewWarehousesSection(ctx)`
  ([permissions.ts:102](src/core/application/auth/permissions.ts#L102)):
  Admin always, Manager only if assigned to **more than one** warehouse (a
  single-warehouse manager has nothing to switch between), Operator never.
  All three roles still get `warehouses:read` so inventory/movements
  dropdowns can list their own warehouses.

Enforced at **three layers**, deliberately redundant — UI hiding is never the
security boundary:

1. **API** — `withApi(permission, handler)` rejects (401/403) before any
   handler code runs.
2. **Service** — every service method calls `authorize(ctx, permission)`
   again and owns business invariants (operator = exactly 1 warehouse,
   manager ≥ 1, admin = 0; can't change your own role; can't delete
   yourself).
3. **Repository** — structural tenant/warehouse scoping (next section), so
   even a buggy service can't read or write outside the caller's scope.

## 9. Multi-tenant isolation mechanics

The load-bearing rule: **repositories cannot be constructed without a
TenantContext, and every query they emit includes the tenant scope.**

- [container.ts](src/core/infrastructure/container.ts) is the *only* way to
  obtain services/repositories — `createServices(ctx)` requires a resolved
  `TenantContext`. There is no code path to Postgres that skips this.
- Each repository derives a `scopedWhere` from the context: always
  `organizationId = ctx.organizationId`, plus `warehouseId IN
  ctx.accessibleWarehouseIds` for warehouse-scoped roles (Admins carry `null`
  = org-wide). Route handlers **never** write tenant filters themselves.
- Writes reuse the same scoped `WHERE` (`updateMany`/`deleteMany` + a row-count
  guard), so a cross-tenant id can't be mutated even by id-guessing.
- **Row creation is checked explicitly** — an insert has no existing row to
  scope a `WHERE` against, so services that create a row referencing another
  tenant-scoped entity look it up first. E.g.
  `InventoryService.create()` ([inventory-service.ts:43](src/core/application/services/inventory-service.ts#L43))
  calls `WarehouseRepository.findById()` before creating an `inventory_items`
  row — that lookup is itself tenant/warehouse-scoped, so a `warehouseId`
  from another organization (or outside an Admin's scope check, since Admins
  are otherwise unrestricted) simply returns `null` → 404, and the item is
  never created.
- Cross-tenant or out-of-scope lookups return **404, not 403** (see §5 —
  `NotFoundError` is deliberately dual-purpose).
- User-supplied filters (`?warehouseId=...`) only narrow *within* scope;
  requesting a foreign warehouse yields an empty page, not an error.
- The **one** deliberately unscoped repository is
  [identity-repository.ts](src/core/application/ports/identity-repository.ts)
  — it exists solely for the sign-in bootstrap (you don't have a tenant yet
  when resolving who you are) and is unreachable from any business service.
- BigQuery analytics queries are parameterized with the same
  organization + warehouse scope as the OLTP side.

## 10. The API envelope & error model

Every `/api/v1/*` response has the same shape
([lib/api/response.ts](src/lib/api/response.ts)):

```jsonc
// success                                   // failure
{ "success": true,                           { "success": false,
  "data": [...],                               "error": {
  "meta": { "page": 1, "pageSize": 25,           "code": "INSUFFICIENT_STOCK",
            "totalItems": 128,                    "message": "Cannot move 50 units…",
            "totalPages": 6 } }                   "details": { … } } }
```

`toErrorResponse()` ([response.ts:58](src/lib/api/response.ts#L58)) is the
single place that maps errors to transport: `ZodError` → 400 with a
`path`/`message` array; `DomainError` → status from `STATUS_BY_CODE`; anything
else → logged server-side and flattened to a generic 500 (never leaks
internals). The client's `apiFetch()`
([lib/client/api.ts](src/lib/client/api.ts)) throws a typed `ApiError` on any
non-success envelope, which UI components catch to show field errors or
toast messages.

---

## 11. Every workflow, traced end to end

### 11.1 Sign-in & session resolution

*Every* authenticated request passes through this first.

1. **[src/proxy.ts](src/proxy.ts)** — Next 16 "proxy" (middleware). `authkitProxy`
   runs on every matched request except static assets, verifies/refreshes the
   sealed session cookie, and redirects anonymous users to WorkOS-hosted
   sign-in. `/api/v1/:path*` is excluded from the redirect on purpose —
   `withApi()` answers 401 as JSON there, which is what API clients expect;
   session verification still happens, just without the browser redirect.
2. User authenticates on WorkOS's hosted UI → redirected to
   **[src/app/api/auth/callback/route.ts](src/app/api/auth/callback/route.ts)**.
   `handleAuth({ returnPathname: '/dashboard', baseURL: appBaseURL() })`
   exchanges the code, seals the session into an encrypted cookie, redirects
   to `/dashboard`. `appBaseURL()` exists because behind Cloud Run's TLS
   termination, `request.nextUrl` reports the internal `0.0.0.0:8080`
   address rather than the public hostname — the origin is derived from
   `WORKOS_REDIRECT_URI` instead, which is guaranteed correct since it must
   match WorkOS's registered callback URL anyway.
3. The next page render calls **[src/lib/auth/session.ts](src/lib/auth/session.ts)**'s
   `getTenantContext()` (`session.ts:41`), memoized per-request via React
   `cache()`. It calls `withAuth({ ensureSignedIn: true })` (WorkOS SDK),
   then `resolveExistingContext(user)`.
4. `resolveExistingContext` → `createUserSyncService()`
   ([container.ts:76](src/core/infrastructure/container.ts#L76)) →
   `UserSyncService.resolveExisting()`
   ([user-sync-service.ts:42](src/core/application/services/user-sync-service.ts#L42)),
   which looks the WorkOS identity up in Postgres via the unscoped
   `PrismaIdentityRepository`:
   ```ts
   async resolveExisting(workosUser) {
     const linked = await this.identity.findByWorkosUserId(workosUser.workosUserId);
     if (linked) { if (!linked.isActive) throw new ForbiddenError(...); return linked; }
     const provisioned = await this.identity.findUnlinkedByEmail(workosUser.email);
     if (provisioned) { ...link and return... }
     return null;   // → onboarding
   }
   ```
   Three outcomes: (a) already linked → normal sign-in; (b) provisioned by an
   admin but never signed in → links by email, flips `invitationStatus` to
   `ACCEPTED`; (c) unknown → `null` → redirect to `/onboarding` (§11.2).
5. On success, `UserSyncService.toTenantContext()`
   ([user-sync-service.ts:119](src/core/application/services/user-sync-service.ts#L119))
   builds the `TenantContext` — `accessibleWarehouseIds` is `null` for
   Admins, otherwise the user's assigned warehouse ids.
6. Two entry points share this logic: `getTenantContext()` (redirects on
   failure — used by Server Components/pages) and `tryGetTenantContext()`
   (returns `null` instead — used inside `withApi()` so API routes answer 401
   JSON, not a redirect).

**Gotcha worth knowing:** `/sign-in` is a `route.ts`, not a `page.tsx` —
`getSignInUrl()` sets a PKCE cookie, which must happen from a route
handler/server action/middleware, never during page render.

### 11.2 Admin onboarding (new tenant creation)

Fires when an unknown WorkOS identity signs in — no tenant is silently
auto-created.

1. `getTenantContext()` (§11.1 step 3) resolves to `null` → `redirect('/onboarding')`.
2. **[src/app/onboarding/page.tsx](src/app/onboarding/page.tsx)** — deliberately **outside**
   the `(app)` route group, because that group's own layout calls
   `getTenantContext()` too and would redirect right back to `/onboarding`,
   looping forever. It calls `getOnboardingState()`
   ([session.ts:68](src/lib/auth/session.ts#L68)) which returns either
   `{ status: 'onboarded' }` (redirect away — handles the case where an admin
   invited this person in the meantime) or `{ status: 'needs_onboarding',
   workosUser, sessionWorkosOrgId }`.
3. **[onboarding-form.tsx](src/app/onboarding/onboarding-form.tsx)** — a client
   form (company name input) bound to the server action via `useActionState`.
4. **[src/app/onboarding/actions.ts](src/app/onboarding/actions.ts)** —
   `completeOnboardingAction()` re-checks onboarding state server-side (never
   trusts the client), then calls
   `UserSyncService.onboard(workosUser, { organizationName, sessionWorkosOrgId })`.
5. **[user-sync-service.ts:74](src/core/application/services/user-sync-service.ts#L74)**
   `onboard()`:
   - Idempotency check: if `resolveExisting()` now returns a user, return it
     (handles double-submits / just-got-invited races) instead of creating a
     second tenant.
   - Validates the org name (1–120 chars).
   - **Prefers linking to the WorkOS Organization already on the session**
     (if the user authenticated via an org's SSO); otherwise calls
     `AuthDirectory.createOrganization()` and immediately
     `addOrganizationMembership()` so a WorkOS Organization is never left
     with zero members.
   - Only *then* calls `identity.createOrganizationWithAdmin()` — creates the
     local `Organization` + `User` (role `ADMIN`) row in one write.
   - **Environment-dependent failure policy**, owned entirely by
     `WorkosAuthDirectory`
     ([workos-auth-directory.ts:106](src/core/infrastructure/auth/workos-auth-directory.ts#L106)):
     in production, any WorkOS failure throws (`degrade()` re-throws) so
     onboarding fails cleanly rather than creating a tenant with no real
     WorkOS org behind it; in local/dev, WorkOS failures degrade to
     `workosOrgId: null` and onboarding still succeeds, so the app stays
     usable without real WorkOS credentials.
6. Redirects to `/dashboard` on success, now with a real `TenantContext`.

### 11.3 User invitation

Fires when an Admin adds a teammate from the Users page — *not* auto-linked,
goes through a real WorkOS invitation.

1. **UI** — Users page "Add user" dialog (form: email, role, warehouse
   assignments) → `apiFetch('/api/v1/users', { method: 'POST', body })`.
2. **[api/v1/users/route.ts](src/app/api/v1/users/route.ts)** —
   `withApi(Permission.UsersManage, ...)`, `userCreateSchema.parse(...)`, calls
   `services.users.create(body)`.
3. **[user-service.ts:48](src/core/application/services/user-service.ts#L48)**
   `create()`:
   - `authorize(ctx, Permission.UsersManage)`.
   - `validateAssignments(role, warehouseIds)` — Operator must have exactly
     1 warehouse, Manager ≥ 1, Admin exactly 0; also verifies every
     warehouse id actually exists (tenant-scoped) via
     `existingWarehouseIds()`, throwing `NotFoundError` on the first missing
     one.
   - Calls `AuthDirectory.sendInvitation({ organizationId, email, roleSlug,
     inviterWorkosUserId })` **before writing any local row.**
     `roleSlug` maps `ADMIN`→`admin`, `MANAGER`→`manager`,
     `OPERATOR`→`operator` (`WORKOS_ROLE_SLUGS`).
   - Only once WorkOS confirms is `users.create()` called, stamping
     `workosInvitationId`, `invitationStatus: 'PENDING'`, `invitedAt`.
4. **[workos-auth-directory.ts:53](src/core/infrastructure/auth/workos-auth-directory.ts#L53)**
   `sendInvitation()` — calls `workos.userManagement.sendInvitation(...)`,
   with `withRoleSlugFallback()`: if WorkOS rejects the role slug as
   unrecognized (a fresh WorkOS project has no `admin`/`manager`/`operator`
   Organization Roles configured yet), it retries once *without* a role slug
   so the invitation still sends — Storex's local `role` column stays the
   sole source of truth for app permissions regardless.
   - **Same environment-dependent failure policy** as onboarding: production
     throws (surfaced as 422 `BUSINESS_RULE_VIOLATION`, and `UserService.create()`
     never reaches the local write — "no invitation ⇒ no local user" holds
     without any rollback logic); local/dev degrades to `null`, and the user
     is still created with `invitationStatus: 'SKIPPED'` (shown in the grid
     as "Invite not sent").
5. Invitee accepts the emailed invitation on WorkOS's side; WorkOS
   creates/links their WorkOS user + Organization Membership (a WorkOS-side
   concept only — carries no Storex permissions).
6. On their first Storex sign-in, `UserSyncService.resolveExisting()` finds
   the unlinked-by-email row (§11.1 step 4b), links `workosUserId`, flips
   `invitationStatus` to `ACCEPTED`. Role/warehouse assignments set at
   creation time are untouched by this.

### 11.4 User management (update/deactivate)

1. **[api/v1/users/[id]/route.ts](src/app/api/v1/users/%5Bid%5D/route.ts)** — PATCH/DELETE, both `withApi(Permission.UsersManage, ...)`.
2. **[user-service.ts:75](src/core/application/services/user-service.ts#L75)**
   `update()` — blocks changing your *own* role
   (`BusinessRuleViolationError`), re-runs `validateAssignments()` with the
   merged role/warehouseIds.
3. `remove()` ([user-service.ts:94](src/core/application/services/user-service.ts#L94))
   blocks removing yourself. Note: the repository-level delete is really a
   soft "deactivate" in practice for users with movement history — the FK on
   `stock_movements.createdById` is `RESTRICT`, so a hard delete on a user
   with any recorded movement fails at the database level; the intended path
   is setting `isActive: false` via `update()`, not `remove()`.

### 11.5 Warehouse CRUD

Admin-only ([Permission.WarehousesManage]).

1. **UI** — [warehouse-dialog.tsx](src/components/warehouses/warehouse-dialog.tsx) on the
   Warehouses page.
2. **[api/v1/warehouses/route.ts](src/app/api/v1/warehouses/route.ts)** /
   **[[id]/route.ts](src/app/api/v1/warehouses/%5Bid%5D/route.ts)** — standard
   `withApi` + Zod (`warehouseCreateSchema`/`warehouseUpdateSchema` in
   [schemas.ts](src/lib/api/schemas.ts)) + service call.
3. **[warehouse-service.ts](src/core/application/services/warehouse-service.ts)**:
   - `create()` — capacity must be positive.
   - `update()` — **cannot reduce capacity below `existing.usedCapacity`**
     (the storage-unit-weighted sum currently occupied) →
     `BusinessRuleViolationError`.
   - `remove()` — **cannot delete a warehouse with any stock on hand**
     (`totalQuantity > 0`) → `BusinessRuleViolationError` ("Move the stock
     out first").
4. **[prisma-warehouse-repository.ts](src/core/infrastructure/repositories/prisma-warehouse-repository.ts)**
   — `statsFor()` computes `usedCapacity`/`totalQuantity` by loading the
   warehouse's inventory rows and reducing `quantity * storageUnitsPerItem`
   in JS (Prisma can't `SUM` a per-row product natively — see §18 trade-off
   #3).

### 11.6 Inventory item CRUD

Manager/Operator only ([Permission.InventoryManage]) — Admin is read-only here.

1. **UI** — [inventory-item-dialog.tsx](src/components/inventory/inventory-item-dialog.tsx).
2. **[api/v1/inventory/route.ts](src/app/api/v1/inventory/route.ts)** /
   `[id]/route.ts` — Zod schemas enforce SKU format
   (`/^[A-Za-z0-9._-]+$/`) and the **mutually-exclusive** `storageUnitsPerItem`
   / `itemsPerStorageUnit` pair (`hasExclusiveStorageRatio` refinement in
   [schemas.ts:72](src/lib/api/schemas.ts#L72)).
3. **[inventory-service.ts:34](src/core/application/services/inventory-service.ts#L34)**
   `create()` — looks up the target warehouse via the *tenant-scoped*
   `WarehouseRepository.findById()` first (see §9's "row creation" note —
   this is what stops an Admin's unrestricted scope from pairing a foreign
   warehouse id with this org's `organizationId`).
4. `remove()` — **cannot delete an item with `quantity > 0`** ("Record
   outbound movements before deleting it").
5. Repository: [prisma-inventory-repository.ts](src/core/infrastructure/repositories/prisma-inventory-repository.ts),
   with `usedCapacityInWarehouse()` used by the movement-capacity checks in
   §11.7.

### 11.7 Record a stock movement

**The flagship write path** — the one workflow that touches every layer
including a hand-rolled concurrency guard.

**UI — [record-movement-dialog.tsx](src/components/movements/record-movement-dialog.tsx)**
Opened from the Movements page or an Inventory row action.
- If no item was preselected, fetches an item picker via SWR
  (`/api/v1/inventory?...`).
- Client-side `validate()` — positive-integer quantity, and for OUTBOUND,
  `qty <= selected.quantity`. **UX nicety only, never trusted.**
- `submit()` → `apiFetch('/api/v1/movements', { method: 'POST', body: {
  inventoryItemId, type, quantity, note? } })`.

**[src/app/api/v1/movements/route.ts](src/app/api/v1/movements/route.ts)**
```ts
export const POST = withApi(Permission.MovementsCreate, async ({ req, services }) => {
  const body = movementCreateSchema.parse(await req.json());
  return created(await services.movements.record(body));
});
```

**`withApi()` — [lib/api/handler.ts](src/lib/api/handler.ts)** — before the
route callback runs: `tryGetTenantContext()` (401 if none) →
`authorize(ctx, Permission.MovementsCreate)` (**layer 1**, 403 if missing) →
`createServices(ctx)` → invoke handler → any thrown error → `toErrorResponse()`.

**[container.ts:41](src/core/infrastructure/container.ts#L41)** `createServices(ctx)`
builds tenant-bound repositories and wires
`new StockMovementService(ctx, movementRepo, inventoryRepo, warehouseRepo)`.
This is the *only* place repositories get constructed.

**[stock-movement-service.ts:48](src/core/application/services/stock-movement-service.ts#L48)**
`record()` — **layer 2** (`authorize()` again), then:
1. Quantity must be a positive integer.
2. `inventory.findById(inventoryItemId)` — tenant-scoped; foreign/inaccessible
   item → `NotFoundError`.
3. OUTBOUND: friendly pre-check `item.quantity < quantity` → `InsufficientStockError`
   (not authoritative — see the repository guard below).
4. INBOUND: capacity check —
   `requiredCapacity = quantity * item.storageUnitsPerItem` vs.
   `warehouse.capacity - usedCapacity` → `CapacityExceededError` if it
   doesn't fit. This is the storage-unit-weighted model, never a raw item
   count.
5. Delegates to `movements.applyMovement({...})` — the *only* place
   quantities actually change.

**[prisma-stock-movement-repository.ts:120](src/core/infrastructure/repositories/prisma-stock-movement-repository.ts#L120)**
`applyMovement()` — **layer 3**, inside a `$transaction`:
```ts
const guard = await tx.inventoryItem.updateMany({
  where: {
    AND: [
      { organizationId: ctx.organizationId, ...(accessibleWarehouseIds ? { warehouseId: { in: accessibleWarehouseIds } } : {}) },
      { id: data.inventoryItemId, warehouseId: data.warehouseId },
      ...(delta < 0 ? [{ quantity: { gte: data.quantity } }] : []),   // ← the real stock guard
    ],
  },
  data: { quantity: { increment: delta } },
});
if (guard.count === 0) { /* distinguish "not found" vs "insufficient stock" and throw */ }
```
This `WHERE quantity >= :qty` **conditional update is the authoritative
concurrency guard** — two simultaneous outbound requests can't both succeed
past zero, because the loser's `updateMany` matches zero rows. Once it
passes, the `StockMovement` row is inserted in the same transaction and
returned (joined with item/warehouse/user).

**Response** flows back: repository DTO → service return → `created(dto)`
envelope (HTTP 201) → `apiFetch` unwraps it → dialog shows
`toast.success(...)`, calls `onSaved()` to revalidate the SWR cache on the
Movements/Inventory page.

**Full round trip:** dialog → `apiFetch` → `route.ts` → `withApi` →
`StockMovementService.record` → `PrismaStockMovementRepository.applyMovement`
(atomic transaction) → Postgres, with permission checks at 2 explicit layers
plus structural tenant scoping baked into every query.

### 11.8 Edit / delete a stock movement

Manager-only (`Permission.MovementsManage` — the one permission Operator
lacks that Manager has).

**UI** — Movements page actions column (gated by `canManage`) →
[edit-movement-dialog.tsx](src/components/movements/edit-movement-dialog.tsx), or a
delete action wrapped in [confirm-dialog.tsx](src/components/confirm-dialog.tsx).

**[api/v1/movements/[id]/route.ts](src/app/api/v1/movements/%5Bid%5D/route.ts)**
— PATCH/DELETE, both `withApi(Permission.MovementsManage, ...)`.

**Update** ([stock-movement-service.ts:91](src/core/application/services/stock-movement-service.ts#L91)):
- Only `quantity`/`note` are editable — never type, item, or warehouse
  (that's really a different movement).
- Computes the **signed delta**: `signedOld`/`signedNew` treat INBOUND as
  positive and OUTBOUND as negative, so `delta = signedNew - signedOld` is
  the net effect on the item's quantity regardless of movement direction.
- If `delta > 0` (a bigger inbound or a smaller outbound edit), the same
  soft capacity pre-check as recording a new inbound applies. The "don't go
  negative" case is left entirely to the repository's atomic guard.
- Repository (`updateMovement`,
  [prisma-stock-movement-repository.ts:~199](src/core/infrastructure/repositories/prisma-stock-movement-repository.ts#L199))
  re-runs the exact same `updateMany`-with-conditional-`WHERE` pattern as
  `applyMovement`, atomically re-deriving `InventoryItem.quantity`.

**Delete** ([stock-movement-service.ts:131](src/core/application/services/stock-movement-service.ts#L131)):
- Deleting an OUTBOUND *gives quantity back* — same soft capacity pre-check
  as an inbound.
- Deleting an INBOUND *takes quantity back down* — guarded (later movements
  may have already consumed that stock), unguarded on the give-back side.
- Repository `deleteMovement()` reverses the movement's effect inside a
  transaction before deleting the row.

This asymmetry (Manager can rewrite ledger history, Operator can't) is the
one deliberate break from "Manager and Operator have identical permission
sets" — an Operator's mistake needs a Manager to correct it, and a
reversal/void-movement pattern was explicitly rejected in favor of true
edit/delete because it would have polluted analytics flow metrics (a
reversal would show up as extra inbound/outbound volume that never actually
happened).

### 11.9 Dashboard analytics

**The other structurally distinct workflow** — reads from a different
database than everything else.

1. **[src/app/(app)/dashboard/page.tsx](src/app/(app)/dashboard/page.tsx)** — Server
   Component. `requirePagePermission(Permission.AnalyticsRead)`
   ([lib/auth/guards.ts:16](src/lib/auth/guards.ts#L16)) resolves the tenant
   context and redirects away if the role can't see analytics (UI
   convenience only — the service enforces it too). Renders
   `<DashboardView />`.
2. **[dashboard-view.tsx](src/components/dashboard/dashboard-view.tsx)** — client
   component holding the period selector (`days`: 7/30/90/180) and
   `useSWR('/api/v1/analytics/kpis?days=' + days, ..., { refreshInterval:
   300_000 })` — 5 minutes, matched to Datastream's actual CDC freshness
   (`dataFreshness: "300s"`), so it never polls faster than the data
   actually changes. Sibling components `trend-chart.tsx`,
   `utilization-panel.tsx`, `insights-grid.tsx` each hit their own
   `/api/v1/analytics/{trend,utilization,insights}` endpoint the same way,
   `insights-grid.tsx` additionally passing server-side warehouse/status/
   last-movement-date filters.
3. **[api/v1/analytics/kpis/route.ts](src/app/api/v1/analytics/kpis/route.ts)**
   — same `withApi(Permission.AnalyticsRead, ...)` shape as every other
   route: parse `days` via Zod (`periodQuerySchema`), call
   `services.analytics.kpis(days)`.
4. **[analytics-service.ts](src/core/application/services/analytics-service.ts)**
   — `authorize()` again, validates `1 <= days <= 180`
   (`assertValidPeriod`), delegates to the `AnalyticsRepository` port.
5. **The fork** — `createAnalyticsRepository(ctx)`
   ([container.ts:57](src/core/infrastructure/container.ts#L57)) picks the
   implementation from `ANALYTICS_SOURCE`:
   - **Production**: `BigQueryAnalyticsRepository`
     ([bigquery-analytics-repository.ts](src/core/infrastructure/analytics/bigquery-analytics-repository.ts))
     — parameterized SQL against `storex_analytics` views (`dim_warehouse`,
     `fact_inventory_current`, `fact_stock_movement`,
     `agg_daily_warehouse_flows`), fed by Datastream CDC replicating
     Postgres → BigQuery.
   - **Local dev** (`ANALYTICS_SOURCE=postgres`):
     `PostgresAnalyticsRepository` queries the *same* Postgres OLTP database
     directly, computing equivalent aggregates. **Hard-refused in
     production** — `createAnalyticsRepository` throws if
     `NODE_ENV === 'production'` and this source is requested, so the dev
     fallback can never accidentally ship.
6. Both satisfy the same port, so the service (and everything above it)
   never knows which one answered.
7. Result → `ok(data)` envelope → SWR → KPI cards / Recharts trend chart /
   insights grid re-render.

**Key architectural point:** the dashboard never queries the transactional
Postgres tables directly in production — that's enforced by the container,
not just convention.

### 11.10 The list-page pattern (shared by 4 workflows)

Warehouses, Inventory, Movements, and Users pages all share one client hook —
**[lib/client/use-paginated.ts](src/lib/client/use-paginated.ts)**:

```ts
export function usePaginated<T>(endpoint: string, initial) {
  const [state, setState] = useState<PaginatedQueryState>({ page: 1, pageSize: 25, ... });
  const key = /* build ?page&pageSize&sortBy&sortDir&search&...filters */;
  const swr = useSWR<ApiResult<T[]>>(key, swrFetcher<T[]>, { keepPreviousData: true });
  return { ...swr, items, meta, state, setPage, setSearch, setSort, setFilter };
}
```

The **server is the source of truth** for page contents (not AG Grid's
client-side row model) — `setPage`/`setSearch`/`setSort`/`setFilter` all
rebuild the query string and let SWR refetch. This is why every list
endpoint (`GET /api/v1/{warehouses,inventory,movements,users}`) accepts the
same `?page&pageSize&sortBy&sortDir&search` contract, validated by a
`paginationSchema`-extending Zod schema per resource in
[lib/api/schemas.ts](src/lib/api/schemas.ts). Grid rendering itself goes
through the shared [data-grid.tsx](src/components/data-grid.tsx) (AG Grid
wrapper).

The `(app)` layout ([src/app/(app)/layout.tsx](src/app/(app)/layout.tsx)) is
itself worth noting: it's a Server Component that resolves `TenantContext`
once and derives the sidebar nav from the *same* `hasPermission`/
`canViewWarehousesSection` predicates the API enforces — so the sidebar can
never link to a destination the signed-in role can't actually use.

---

## 12. REST API reference

Versioned under `/api/v1`, consistent envelope (§10), Zod validation,
pagination/filtering/sorting on every list endpoint:

```
GET/POST            /api/v1/warehouses          ?page&pageSize&sortBy&sortDir&search
GET/PATCH/DELETE    /api/v1/warehouses/:id
GET/POST            /api/v1/inventory           ?…&warehouseId
GET/PATCH/DELETE    /api/v1/inventory/:id
GET/POST            /api/v1/movements           ?…&warehouseId&type&from&to&quantityMin&quantityMax&recordedBy
PATCH/DELETE        /api/v1/movements/:id                          (manager-only)
GET/POST            /api/v1/users               ?…&role&status     (admin-only)
GET/PATCH/DELETE    /api/v1/users/:id                               (admin-only)
GET                 /api/v1/analytics/kpis        ?days
GET                 /api/v1/analytics/trend        ?days
GET                 /api/v1/analytics/utilization
GET                 /api/v1/analytics/insights     ?days&warehouseId&status&lastMovementFrom&lastMovementTo
GET                 /api/v1/me
```

Domain error codes map to transport codes in one place (§10): 400
validation, 401/403 auth, 404 not-found (incl. cross-tenant), 409
conflict/stock/capacity, 422 business-rule violation.

## 13. Analytics pipeline (BigQuery/Datastream)

OLTP and OLAP are fully separated:

```
Cloud SQL (Postgres) ──logical replication──▶ Datastream ──CDC merge──▶
BigQuery storex_raw (replica tables) ──SQL views──▶ storex_analytics
(dim_warehouse · fact_inventory_current · fact_stock_movement ·
agg_daily_warehouse_flows) ──parameterized queries──▶ /api/v1/analytics/*
```

- **Why Datastream, not dual-writes:** managed serverless CDC, no
  application-level dual-write drift risk, backfills handled, freshness
  configurable (5 min here). Trade-off: minutes-level dashboard staleness
  (see [infra/analytics/datastream-setup.md](infra/analytics/datastream-setup.md)
  for the full runbook and trade-off table).
- **Analytics schema ≠ OLTP mirror** —
  [infra/analytics/create_analytics_views.sql](infra/analytics/create_analytics_views.sql)
  defines a small star-style read model as *views* over the Datastream
  replica tables (`storex_raw.public_<table>`), zero-maintenance (no
  scheduled jobs). The `users` table is **deliberately not replicated** — no
  PII in the warehouse.
  - `fact_inventory_current` precomputes `used_capacity = quantity *
    storage_units_per_item` per SKU.
  - `fact_stock_movement` precomputes `used_capacity_delta` per movement the
    same way (using the item's *current* ratio — movements don't snapshot it
    historically).
  - `agg_daily_warehouse_flows` sums those into daily inbound/outbound units
    per warehouse for the trend chart.
  - Every downstream query sums the storage-weighted measure, **never** a
    raw quantity — except `movementVelocity` (a cadence measure: movement
    events per day) and the per-item `inboundInPeriod`/`outboundInPeriod`
    insight fields, which are deliberately raw event counts, not space
    measures.
- Thresholds for the per-SKU operational insight (Low stock / Dead stock /
  Fast mover / Healthy) are shared between both `AnalyticsRepository`
  implementations via
  [analytics-thresholds.ts](src/core/application/analytics-thresholds.ts), so
  the Postgres dev fallback and the BigQuery production path can never
  silently diverge on classification logic.
- If the view promoted to a materialized view someday (query-volume
  justified), only `create_analytics_views.sql` and the Datastream refresh
  cadence would need to change — no application code touches BigQuery table
  layout directly.

## 14. Frontend architecture

- **shadcn/ui is built on [Base UI](https://base-ui.com), not Radix** —
  despite looking like standard shadcn output. Concretely: `Button` has no
  `asChild` prop (use `render={<a/>}` + `nativeButton={false}` for
  non-button elements); `Select`'s `onValueChange` receives `string | null`,
  not just `string`.
- **AG Grid, server-driven** — [data-grid.tsx](src/components/data-grid.tsx) wraps AG
  Grid Community in "you tell me the page's exact contents" mode rather than
  its client-side row model, so the pattern scales past what fits in memory
  and the API stays the single source of truth for sorting/filtering/paging
  (see §11.10).
- **SWR everywhere** for client data — no global state library. Mutations
  call `apiFetch` directly then either call a passed-in `onSaved()` callback
  (which the parent uses to `mutate()`/refetch) or rely on SWR's focus
  revalidation.
- **Recharts** for the trend chart on the dashboard.
- **Zod on both sides** — the same validation shapes described in the API
  reference are what [lib/client/validation.ts](src/lib/client/validation.ts)'s
  `useFieldErrors()` hook renders as inline field errors when `apiFetch`
  throws a `VALIDATION_ERROR` `ApiError`.
- **Route groups**: `(app)` wraps every authenticated page in one shared
  sidebar layout ([src/app/(app)/layout.tsx](src/app/(app)/layout.tsx));
  `onboarding` and `sign-in` sit outside it deliberately (§11.2's
  redirect-loop note).

## 15. Local development

```bash
npm install
docker compose up -d                  # local PostgreSQL 16, host port 5433
cp .env.example .env                  # fill in WorkOS values, set ANALYTICS_SOURCE=postgres
npx prisma migrate deploy && npx prisma db seed
npm run dev                           # http://localhost:3000
npm run smoke                         # exercises services/repos against the seeded DB
```

Scripts ([package.json](package.json)):

| Script | What it does |
|---|---|
| `npm run dev` | `next dev` |
| `npm run build` | `prisma generate && next build` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | `prisma migrate dev` (local schema iteration) |
| `npm run db:deploy` | `prisma migrate deploy` (production-style, no interactive prompts) |
| `npm run db:seed` | `prisma db seed` → runs `prisma/seed.ts` |
| `npm run db:studio` | `prisma studio` (visual DB browser) |
| `npm run smoke` | `tsx scripts/smoke-test.ts` — the only automated verification today; no unit/integration test suite exists yet |

**Local Postgres runs on port 5433**, not 5432 — the dev machine this was
built on has a native Postgres already on 5432, so `docker-compose.yml` maps
the container to 5433 and `.env` points there.

**Seed data**
[prisma/seed.ts](prisma/seed.ts) is deterministic (mulberry32 PRNG, fixed
seed `20260713`) and creates two fixed tenants with ~90 days of movement
history each:
- **PVP Logistics** — 3 warehouses (North DC/Central Hub/South Depot), 3
  users (admin/manager/operator), 12 SKUs spanning a wide capacity-ratio
  range (dense consumables like shipping labels at `0.001` storage
  units/item up through pallets at `4` and hand-truck equipment at `8`).
- **Majestic Electronics** — 2 warehouses, 2 users (admin/operator, no
  manager), 12 electronics SKUs. Only the Main Warehouse is stocked — East
  DC is intentionally left empty rather than inventing a fictional third
  staff member, since the single operator is pinned to exactly one
  warehouse.

Users are seeded **unlinked** (no `workosUserId`), matched by email on first
real WorkOS sign-in — no WorkOS Organization needs to be linked for that to
work; that's only required if an admin later invites a *new* teammate
through the app. Signing in with any other email lands on `/onboarding`
(§11.2) — the fastest way to see tenant isolation live, since that becomes a
third, completely empty tenant.

**Prisma 7 quirks** (cost real debugging time — don't rediscover them):
- No `url` in `schema.prisma` — connection config lives in
  [prisma.config.ts](prisma.config.ts), which needs `DATABASE_URL` present
  at CLI load time, hence `import 'dotenv/config'` there.
- Client generator is `prisma-client`, output to `src/generated/prisma`
  (checked into the repo path, not hidden in `node_modules`).
  `PrismaClient` requires `new PrismaPg({ connectionString })` as its
  adapter — no bundled Rust query-engine binary.
- `prisma migrate diff` uses `--to-schema`, not `--to-schema-datamodel`.

**AuthKit v4 + Next 16 quirks:**
- Middleware file is `src/proxy.ts` (Next 16's rename of `middleware.ts`)
  using `authkitProxy`.
- The runtime reads the redirect URI from `NEXT_PUBLIC_WORKOS_REDIRECT_URI`
  at the SDK level despite the `.d.ts` saying `WORKOS_REDIRECT_URI` — StoreX
  works around this by passing `redirectUri: process.env.WORKOS_REDIRECT_URI`
  explicitly wherever the SDK accepts it as an option
  ([proxy.ts](src/proxy.ts), [lib/auth/urls.ts](src/lib/auth/urls.ts)), so
  the value stays runtime-configurable (important for Cloud Run, where env
  vars aren't baked in at build time).
- `getSignInUrl()` sets a PKCE cookie and must be called from a route
  handler/server action/middleware — never during page render — which is
  why `/sign-in` is a `route.ts` rather than a page.

For a fuller step-by-step (including troubleshooting), see
[LOCALSETUP.md](LOCALSETUP.md).

## 16. Deployment

```bash
# 1. One-time provisioning (APIs, Artifact Registry, Cloud SQL, BigQuery, Secret Manager, IAM)
PROJECT_ID=my-project bash infra/gcp/setup.sh

# 2. Update the WorkOS secrets in Secret Manager with real values.

# 3. Build → push → migrate → deploy (Cloud Build)
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_REGION=europe-west1,_SQL_INSTANCE=my-project:europe-west1:storex-pg

# 4. Point the WorkOS redirect URI at https://<cloud-run-url>/api/auth/callback
#    and refresh the storex-workos-redirect-uri secret.

# 5. CDC pipeline: follow infra/analytics/datastream-setup.md
```

**[Dockerfile](Dockerfile)** — 3-stage build on `node:22-alpine`:
1. `deps` — `npm ci`.
2. `builder` — copies deps + source, injects **build-time-only placeholder**
   env vars (never real secrets — `prisma generate` and Next's build-time
   env evaluation just need *something* present), runs `prisma generate` +
   `next build`.
3. `runner` — copies only the Next.js **standalone** output
   (`.next/standalone`, `.next/static`, `public`), plus the Prisma CLI +
   schema/config (so a release step can run `prisma migrate deploy`), runs
   as a non-root `nextjs` user on port 8080. One documented gotcha: the
   Prisma CLI is invoked via its real script path, not the
   `node_modules/.bin/prisma` symlink — Docker's `COPY` dereferences
   symlinks into standalone files, which breaks the CLI's lookup of its
   sibling `.wasm` asset.

Migrations run as a **release step in Cloud Build**, never at container
boot — Cloud Run instances must start fast and must not race each other on
schema changes.

**cloudbuild.yaml** orchestrates: build image → push to Artifact Registry →
run `prisma migrate deploy` against Cloud SQL → deploy to Cloud Run.

## 17. Environment variables

| Variable | Scope | Description |
|---|---|---|
| `DATABASE_URL` | secret | Postgres connection string (Cloud SQL socket path in prod) |
| `WORKOS_API_KEY` | secret | WorkOS secret key |
| `WORKOS_CLIENT_ID` | secret | WorkOS client id |
| `WORKOS_COOKIE_PASSWORD` | secret | ≥32-char session cookie encryption key |
| `WORKOS_REDIRECT_URI` | config | Must match the WorkOS dashboard entry exactly |
| `ANALYTICS_SOURCE` | config | `bigquery` (prod, default) · `postgres` (local dev only — refused in production) |
| `GCP_PROJECT_ID` | config | BigQuery project |
| `BIGQUERY_DATASET` | config | Analytics dataset (default `storex_analytics`) |
| `SEED_*_EMAIL` | dev | Optional seed sign-in email overrides |
| `APP_BASE_URL` | config | Overrides the derived public origin for unusual deployments |

## 18. Architectural decisions & trade-offs

1. **Tenant scoping in repository constructors**, not Postgres RLS or
   per-query filters. Per-query filters are forgettable; RLS is the gold
   standard but couples policies to DB session state (`SET app.org_id`),
   complicating pooling and local DX. Constructor-injected scope gives
   compile-time-visible, testable isolation with one obvious audit point.
   RLS remains a compatible *additional* hardening step (see §19).
2. **Movement-driven quantities with a conditional atomic update** over
   optimistic locking or serializable transactions. Correctness comes from
   `UPDATE ... WHERE quantity >= :qty` plus a DB `CHECK`; reads stay O(1)
   against a materialized column. Trade-off: warehouse *capacity* is checked
   **pre-transaction** (a concurrent inbound can overshoot slightly) —
   accepted to keep the hot write path free of serializable transactions.
3. **`storageUnitsPerItem` weighting computed in application code, not SQL
   aggregation.** Prisma's `groupBy`/`aggregate` can only sum a single
   column, not a per-row product like `quantity * storageUnitsPerItem`, so
   `PrismaWarehouseRepository.statsFor` and
   `PrismaInventoryRepository.usedCapacityInWarehouse` load rows and reduce
   in JS. Accepted at this app's scale (hundreds of SKUs per warehouse); a
   `$queryRaw SUM(quantity * "storageUnitsPerItem")` is the natural next step
   if that stops being true. BigQuery has no such constraint —
   `used_capacity` is precomputed in the view.
4. **Dual input mode for the storage ratio**
   (`storageUnitsPerItem`/`itemsPerStorageUnit`), converted once at the API
   boundary, because operators think in whichever direction fits the SKU
   ("1000 needles per storage unit" reads better than "0.001 storage units
   per needle"). Services/repositories only ever see the canonical value.
5. **Datastream CDC over dual-writes/batch ELT** — see the runbook. Accepted
   cost: minutes-level dashboard staleness.
6. **Swappable analytics port with a dev-only Postgres implementation** —
   keeps "dashboard reads only BigQuery" as a hard production rule while
   letting local dev skip GCP entirely.
7. **Self-serve org creation on unknown sign-in, for the first admin only.**
   Every subsequent user goes through a real WorkOS invitation rather than
   silent auto-linking.
8. **Server-driven pagination/sorting with AG Grid as pure renderer** —
   scales past in-memory datasets; the API stays the one source of truth.
9. **Prisma 7 with the pg driver adapter** — no Rust query-engine binary,
   smaller Cloud Run images, first-class TS client.
10. **WorkOS-before-local-write ordering, failure policy owned solely by
    `WorkosAuthDirectory`.** Both `UserService.create()` and
    `UserSyncService.onboard()` call WorkOS first and only write to Postgres
    once it succeeds/degrades — this is what makes "never create a local
    user/tenant WorkOS doesn't know about, in production" hold without any
    compensating-delete/rollback logic. The production-throws /
    local-dev-degrades branch lives entirely inside `WorkosAuthDirectory`
    (a single `NODE_ENV` check mirroring the one in
    `createAnalyticsRepository`), so application services stay
    environment-agnostic.

## 19. Known gaps / future work

- **Postgres RLS** as defense-in-depth beneath the repository scoping.
- **Idempotency keys** on `POST /movements` for safe client retries.
- **Cursor-based pagination** for the movements ledger at scale.
- **Warehouse capacity under advisory locks** to close the concurrent-inbound
  overshoot window (§18 trade-off #2).
- **WorkOS SSO/SCIM** per tenant, an org switcher for multi-org membership,
  and revoking/resending invitations from the Users UI (currently only
  `sendInvitation` is wired up).
- **Materialized BigQuery aggregates + BI Engine** if dashboard query volume
  grows.
- **Audit log table** for administrative actions (user/warehouse changes).
- **Unit/integration test suites** — service-layer rules, repository scoping
  against a disposable Postgres, API contract tests, wired into Cloud Build.
  Today `npm run smoke` (against the seeded dev DB) is the only automated
  check.
- **Observability** — structured request logging, OpenTelemetry traces to
  Cloud Trace, SLO dashboards.

## 20. Current project state (point-in-time)

This section is a snapshot, not a live source of truth — verify against the
actual environment before acting on it.

- Core app (all workflows in §11) was reported feature-complete as of
  2026-07-09, with RBAC/onboarding reworked 2026-07-11, movement edit/delete
  added 2026-07-13, and the dashboard period selector added 2026-07-13.
- `prisma/seed.ts` seeds two real tenants (PVP Logistics, Majestic
  Electronics — see §15) rather than a fake single-tenant demo.
- `.env`'s `DATABASE_URL` was last observed pointing at a public Cloud SQL
  IP (`sslmode=require`) rather than local Docker, but that host was
  **unreachable (P1001)** from at least one prior session — GCP Cloud SQL
  may be provisioned without being reachable from every network (allowlist
  issue). `.env.dev` still holds the local-Docker `localhost:5433` config.
- WorkOS env vars (`WORKOS_API_KEY`/`WORKOS_CLIENT_ID`/
  `WORKOS_COOKIE_PASSWORD`/`WORKOS_REDIRECT_URI`) were non-empty in both
  `.env` and `.env.dev` as of the last check, but their validity (i.e.
  whether they're real, working credentials) was unverified.
- No unit/integration test suite exists yet — `npm run smoke` is the only
  automated verification (§19).

---

*Companion documents: [README.md](README.md) (canonical high-level
reference), [LOCALSETUP.md](LOCALSETUP.md) (step-by-step local setup with
troubleshooting), [infra/analytics/datastream-setup.md](infra/analytics/datastream-setup.md)
(CDC pipeline runbook).*
