# Workflow Trace: Record a Stock Movement

This document traces **one workflow — recording an inbound/outbound stock
movement** — through every layer of the application, showing the **exact
code** that executes at each step and **where that file lives** in the
project structure. This is the flagship workflow because it's the only one
that touches all five layers (Presentation → API → Application → Domain →
Infrastructure) *and* contains real concurrency-safe business logic (the
conditional atomic update that prevents overselling).

**Trigger:** a Manager or Operator clicks "Record movement" on the
Movements or Inventory page, fills in item / direction / quantity, submits.

**Where this fits in the layered architecture:**

```
Presentation   src/app/, src/components/        ← Layer 1, 2
API            src/app/api/v1/*, src/lib/api/    ← Layer 3, 4, 5
Application    src/core/application/             ← Layer 6, 7, 8, 9
Domain         src/core/domain/                  ← Layer 10 (errors used throughout)
Infrastructure src/core/infrastructure/           ← Layer 11, 12
```

---

## Layer 0 — Session verification (runs before this workflow even starts)

Every request to the app, including the click that opens the page this
dialog lives on, passes through the session middleware first.

**File:** [`src/proxy.ts`](src/proxy.ts)
**Location in structure:** project root of `src/` — Next.js 16's "proxy" is
the renamed equivalent of `middleware.ts`, so it sits outside `app/` but
still governs every route.

```ts
import { authkitProxy } from '@workos-inc/authkit-nextjs';

export default authkitProxy({
  redirectUri: process.env.WORKOS_REDIRECT_URI,
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: ['/', '/sign-in', '/api/auth/callback', '/api/v1/:path*'],
  },
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
```

This verifies/refreshes the WorkOS session cookie. `/api/v1/:path*` is
excluded from the *redirect* behavior — the API answers 401 as JSON instead
(see Layer 5) — but the cookie is still checked.

---

## Layer 1 — UI: the dialog component

**File:** [`src/components/movements/record-movement-dialog.tsx`](src/components/movements/record-movement-dialog.tsx)
**Location in structure:** `src/components/movements/` — a feature
component under the Presentation layer, opened from
`src/app/(app)/movements/page.tsx` or an Inventory row action.

Client-side validation runs first (UX only — never trusted), then the
actual network call:

```tsx
'use client';

// ...imports...

export function RecordMovementDialog({ open, item, onOpenChange, onSaved }: {
  open: boolean;
  item: InventoryRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && (
          <MovementForm key={item?.id ?? 'pick'} item={item} onOpenChange={onOpenChange} onSaved={onSaved} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MovementForm({ item, onOpenChange, onSaved }: { /* ... */ }) {
  const [type, setType] = useState<'INBOUND' | 'OUTBOUND'>('INBOUND');
  const [itemId, setItemId] = useState(item?.id ?? '');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const { errors, setErrors, clearErrors, applyApiError } = useFieldErrors();

  const selected = item ?? selectableItems.find((i) => i.id === itemId) ?? null;

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!selected) next.item = 'Choose an item to move.';
    const qty = Number(quantity);
    if (!quantity.trim() || !Number.isInteger(qty) || qty <= 0) {
      next.quantity = 'Quantity must be a positive whole number.';
    } else if (type === 'OUTBOUND' && selected && qty > selected.quantity) {
      next.quantity = `Only ${formatNumber(selected.quantity)} units available.`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();
    if (!validate() || !selected) return;
    setBusy(true);
    try {
      await apiFetch('/api/v1/movements', {
        method: 'POST',
        body: JSON.stringify({
          inventoryItemId: selected.id,
          type,
          quantity: Number(quantity),
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      toast.success(
        `${type === 'INBOUND' ? 'Received' : 'Shipped'} ${formatNumber(Number(quantity))} × ${selected.sku}.`,
      );
      onSaved();
      onOpenChange(false);
    } catch (err) {
      if (!applyApiError(err)) {
        toast.error(err instanceof ApiError ? err.message : 'Failed to record movement.');
      }
    } finally {
      setBusy(false);
    }
  };

  // ...JSX form (item combobox, direction tabs, quantity input, note input)...
}
```

**What runs:** `validate()` rejects non-positive/non-integer quantities and
(client-side only) outbound quantities exceeding what's shown as on-hand.
`submit()` calls `apiFetch('/api/v1/movements', { method: 'POST', body })`.

---

## Layer 2 — Client fetch wrapper

**File:** [`src/lib/client/api.ts`](src/lib/client/api.ts)
**Location in structure:** `src/lib/client/` — shared client-side utilities
(SWR fetchers, typed fetch) used by every feature component.

```ts
'use client';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiResult<T> {
  data: T;
  meta?: PaginationMeta;
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (res.status === 204) {
    return { data: undefined as T };
  }

  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    const error = body?.error;
    throw new ApiError(
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? `Request failed with status ${res.status}`,
      res.status,
      error?.details,
    );
  }
  return { data: body.data as T, meta: body.meta };
}
```

**What runs:** a plain `fetch` to `/api/v1/movements`, then unwraps the
envelope — throws a typed `ApiError` on any `success: false` response.

---

## Layer 3 — API route handler

**File:** [`src/app/api/v1/movements/route.ts`](src/app/api/v1/movements/route.ts)
**Location in structure:** `src/app/api/v1/movements/` — versioned REST API
under the Presentation/API layer, mapped by Next's file-system router to
`POST /api/v1/movements`.

```ts
import { Permission } from '@/core/application/auth/permissions';
import { withApi } from '@/lib/api/handler';
import { created, okPaginated } from '@/lib/api/response';
import { movementCreateSchema, movementListSchema, parseQuery } from '@/lib/api/schemas';

export const GET = withApi(Permission.MovementsRead, async ({ req, services }) => {
  const query = parseQuery(movementListSchema, req.nextUrl);
  return okPaginated(await services.movements.list(query));
});

export const POST = withApi(Permission.MovementsCreate, async ({ req, services }) => {
  const body = movementCreateSchema.parse(await req.json());
  return created(await services.movements.record(body));
});
```

**What runs:** the route handler itself is deliberately thin — it declares
the required `Permission.MovementsCreate`, parses/validates the request body
with `movementCreateSchema` (Zod), and delegates straight to
`services.movements.record(body)`.

**Zod schema used** — **File:** [`src/lib/api/schemas.ts`](src/lib/api/schemas.ts) (`src/lib/api/`):

```ts
export const movementCreateSchema = z.object({
  inventoryItemId: z.string().min(1),
  type: z.enum(MOVEMENT_TYPES),
  quantity: z.number().int().positive().max(1_000_000),
  note: z.string().trim().min(1).max(500).optional(),
});
```

---

## Layer 4 — `withApi()` wrapper (auth + permission gate)

**File:** [`src/lib/api/handler.ts`](src/lib/api/handler.ts)
**Location in structure:** `src/lib/api/` — the shared plumbing every
`route.ts` under `src/app/api/v1/` is built on.

```ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authorize, type Permission } from '@/core/application/auth/permissions';
import type { TenantContext } from '@/core/application/auth/tenant-context';
import { createServices, type Services } from '@/core/infrastructure/container';
import { tryGetTenantContext } from '@/lib/auth/session';
import { failure, toErrorResponse } from './response';

export interface ApiHandlerArgs<P> {
  req: NextRequest;
  ctx: TenantContext;
  services: Services;
  params: P;
}

type ApiHandler<P> = (args: ApiHandlerArgs<P>) => Promise<NextResponse>;

export function withApi<P = Record<string, never>>(
  permission: Permission,
  handler: ApiHandler<P>,
): (req: NextRequest, routeCtx: { params: Promise<P> }) => Promise<NextResponse> {
  return async (req, routeCtx) => {
    try {
      const ctx = await tryGetTenantContext();
      if (!ctx) {
        return failure('UNAUTHORIZED', 'Authentication required.', 401);
      }
      authorize(ctx, permission);
      const services = createServices(ctx);
      return await handler({ req, ctx, services, params: await routeCtx.params });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
```

**What runs, in order:**
1. `tryGetTenantContext()` — resolves the caller's identity into a
   `TenantContext` (Layer 6), or `null` → **401**.
2. `authorize(ctx, Permission.MovementsCreate)` — **permission check #1**
   (Layer 7) → throws `ForbiddenError` → **403** if the role lacks it.
3. `createServices(ctx)` — builds the request-scoped service container
   (Layer 8).
4. Invokes the route's callback (Layer 3's `POST` body); any thrown error
   (Zod, domain, or unknown) is caught and mapped by `toErrorResponse()`
   (Layer 9).

---

## Layer 5 — TenantContext (the object every layer trusts)

**File:** [`src/core/application/auth/tenant-context.ts`](src/core/application/auth/tenant-context.ts)
**Location in structure:** `src/core/application/auth/` — Application
layer, alongside the permission matrix.

```ts
import type { UserRole } from '@/core/domain/enums';

export interface TenantContext {
  organizationId: string;
  /** Internal user id (not the WorkOS id). */
  userId: string;
  email: string;
  role: UserRole;
  /** WorkOS user id of the current user, used as the inviter when this user sends a WorkOS invitation. Null if never linked to WorkOS. */
  workosUserId: string | null;
  /**
   * Warehouse ids this user may access.
   * `null` means unrestricted within the organization (Admins).
   * Managers get their assigned warehouses; Operators exactly one.
   */
  accessibleWarehouseIds: string[] | null;
}

export function canAccessWarehouse(ctx: TenantContext, warehouseId: string): boolean {
  return ctx.accessibleWarehouseIds === null || ctx.accessibleWarehouseIds.includes(warehouseId);
}
```

This is produced once per request by
[`src/lib/auth/session.ts`](src/lib/auth/session.ts)'s `tryGetTenantContext()`
(memoized with React `cache()`), which resolves the verified WorkOS identity
to an internal user via `UserSyncService.resolveExisting()`. It is the
single object threaded through every layer below — no layer re-derives
identity from the raw request.

---

## Layer 6 — Permission matrix

**File:** [`src/core/application/auth/permissions.ts`](src/core/application/auth/permissions.ts)
**Location in structure:** `src/core/application/auth/` — Application layer.

```ts
export const Permission = {
  UsersManage: 'users:manage',
  UsersRead: 'users:read',
  WarehousesManage: 'warehouses:manage',
  WarehousesRead: 'warehouses:read',
  InventoryManage: 'inventory:manage',
  InventoryRead: 'inventory:read',
  MovementsCreate: 'movements:create',
  MovementsRead: 'movements:read',
  MovementsManage: 'movements:manage',
  AnalyticsRead: 'analytics:read',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  ADMIN: [
    Permission.UsersManage, Permission.UsersRead,
    Permission.WarehousesManage, Permission.WarehousesRead,
    Permission.InventoryRead, Permission.MovementsRead, Permission.AnalyticsRead,
  ],
  MANAGER: [
    Permission.WarehousesRead, Permission.InventoryManage, Permission.InventoryRead,
    Permission.MovementsCreate, Permission.MovementsRead, Permission.MovementsManage,
    Permission.AnalyticsRead,
  ],
  OPERATOR: [
    Permission.WarehousesRead, Permission.InventoryManage, Permission.InventoryRead,
    Permission.MovementsCreate, Permission.MovementsRead, Permission.AnalyticsRead,
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function authorize(ctx: TenantContext, permission: Permission): void {
  if (!hasPermission(ctx.role, permission)) {
    throw new ForbiddenError();
  }
}
```

Note `Permission.MovementsCreate` is granted to `MANAGER` and `OPERATOR` but
**not** `ADMIN` — admins are read-only on operational data (separation of
duties). This is `authorize()`'s call at Layer 4; it is called **again**
inside the service (Layer 10) — defense in depth.

---

## Layer 7 — Composition root (dependency wiring)

**File:** [`src/core/infrastructure/container.ts`](src/core/infrastructure/container.ts)
**Location in structure:** `src/core/infrastructure/` — Infrastructure
layer; this is the *only* place a `Services` bundle (and the repositories
inside it) can be constructed.

```ts
export interface Services {
  warehouses: WarehouseService;
  inventory: InventoryService;
  movements: StockMovementService;
  users: UserService;
  analytics: AnalyticsService;
}

export function createServices(ctx: TenantContext, overrides?: { directory?: AuthDirectory }): Services {
  const warehouseRepo = new PrismaWarehouseRepository(prisma, ctx);
  const inventoryRepo = new PrismaInventoryRepository(prisma, ctx);
  const movementRepo = new PrismaStockMovementRepository(prisma, ctx);
  const userRepo = new PrismaUserRepository(prisma, ctx);
  const directory = overrides?.directory ?? new WorkosAuthDirectory();

  return {
    warehouses: new WarehouseService(ctx, warehouseRepo),
    inventory: new InventoryService(ctx, inventoryRepo, warehouseRepo),
    movements: new StockMovementService(ctx, movementRepo, inventoryRepo, warehouseRepo),
    users: new UserService(ctx, userRepo, directory),
    analytics: new AnalyticsService(ctx, createAnalyticsRepository(ctx)),
  };
}
```

**What runs:** `new PrismaStockMovementRepository(prisma, ctx)` — the
repository is *constructed with* the `TenantContext`; there is no
constructor overload that omits it. `new StockMovementService(ctx,
movementRepo, inventoryRepo, warehouseRepo)` wires the service with that
repository plus the two others it needs for cross-entity checks (item
lookup, warehouse capacity).

---

## Layer 8 — Service: business rules

**File:** [`src/core/application/services/stock-movement-service.ts`](src/core/application/services/stock-movement-service.ts)
**Location in structure:** `src/core/application/services/` — Application
layer; this is the **only** place business logic is allowed to live.

```ts
import {
  CapacityExceededError,
  InsufficientStockError,
  NotFoundError,
  ValidationError,
} from '@/core/domain/errors';
import { authorize, Permission } from '../auth/permissions';
import type { TenantContext } from '../auth/tenant-context';

export interface RecordMovementInput {
  inventoryItemId: string;
  type: 'INBOUND' | 'OUTBOUND';
  quantity: number;
  note?: string;
}

export class StockMovementService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly movements: StockMovementRepository,
    private readonly inventory: InventoryRepository,
    private readonly warehouses: WarehouseRepository,
  ) {}

  async record(input: RecordMovementInput): Promise<StockMovementWithRelations> {
    authorize(this.ctx, Permission.MovementsCreate);

    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new ValidationError('Movement quantity must be a positive whole number.');
    }

    // Scoped lookup: an item in another tenant or outside the caller's
    // warehouses is simply "not found".
    const item = await this.inventory.findById(input.inventoryItemId);
    if (!item) throw new NotFoundError('Inventory item', input.inventoryItemId);

    if (input.type === 'OUTBOUND' && item.quantity < input.quantity) {
      // Fast, friendly pre-check. The authoritative guard is the conditional
      // update inside applyMovement, which also wins races.
      throw new InsufficientStockError(item.sku, input.quantity, item.quantity);
    }

    if (input.type === 'INBOUND') {
      const warehouse = await this.warehouses.findById(item.warehouseId);
      if (!warehouse) throw new NotFoundError('Warehouse', item.warehouseId);
      const usedCapacity = await this.inventory.usedCapacityInWarehouse(item.warehouseId);
      const requiredCapacity = input.quantity * item.storageUnitsPerItem;
      const remaining = warehouse.capacity - usedCapacity;
      if (requiredCapacity > remaining) {
        throw new CapacityExceededError(warehouse.name, requiredCapacity, Math.max(0, remaining));
      }
    }

    return this.movements.applyMovement({
      inventoryItemId: item.id,
      warehouseId: item.warehouseId,
      type: input.type,
      quantity: input.quantity,
      note: input.note,
      createdById: this.ctx.userId,
    });
  }

  // update() and delete() also live here — see PROJECT_WALKTHROUGH.md §11.8
}
```

**What runs, in order:**
1. `authorize()` **again** — permission check #2 (redundant with Layer 4 by
   design: defense in depth, not trust in the caller).
2. Quantity must be a positive integer.
3. `inventory.findById()` — a *tenant-scoped* repository call; cross-tenant
   or out-of-scope items resolve to `null` → `NotFoundError` (404, never
   403 — no existence leakage).
4. OUTBOUND: a friendly pre-check against the in-memory `item.quantity` —
   **not** the authoritative guard (that's Layer 12).
5. INBOUND: capacity math — `requiredCapacity = quantity *
   item.storageUnitsPerItem` compared against `warehouse.capacity -
   usedCapacity`. This is the storage-unit-weighted model, never a raw item
   count.
6. Delegates to `movements.applyMovement(...)` — the only method anywhere in
   the codebase that's allowed to change an item's `quantity`.

---

## Layer 9 — Domain errors (used throughout every layer above and below)

**File:** [`src/core/domain/errors.ts`](src/core/domain/errors.ts)
**Location in structure:** `src/core/domain/` — the Domain layer; zero
framework imports, referenced by everything else.

```ts
export type DomainErrorCode =
  | 'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND'
  | 'CONFLICT' | 'INSUFFICIENT_STOCK' | 'CAPACITY_EXCEEDED' | 'BUSINESS_RULE_VIOLATION';

export abstract class DomainError extends Error {
  abstract readonly code: DomainErrorCode;
  readonly details?: unknown;
  constructor(message: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.details = details;
  }
}

export class InsufficientStockError extends DomainError {
  readonly code = 'INSUFFICIENT_STOCK';
  constructor(sku: string, requested: number, available: number) {
    super(`Cannot move ${requested} units of ${sku}: only ${available} on hand.`, {
      sku, requested, available,
    });
  }
}

export class CapacityExceededError extends DomainError {
  readonly code = 'CAPACITY_EXCEEDED';
  constructor(warehouseName: string, requiredCapacity: number, remainingCapacity: number) {
    super(
      `Receiving this quantity would require ${requiredCapacity} storage units, but ${warehouseName} only has ${remainingCapacity} remaining.`,
      { warehouseName, requiredCapacity, remainingCapacity },
    );
  }
}
```

These are the exact errors thrown by Layer 8 (service pre-checks) and Layer
12 (repository's authoritative guard) — the transport-layer mapping back to
HTTP status codes happens in Layer 13.

---

## Layer 10 — Repository port (interface / dependency inversion)

**File:** [`src/core/application/ports/stock-movement-repository.ts`](src/core/application/ports/stock-movement-repository.ts)
**Location in structure:** `src/core/application/ports/` — Application
layer. The service (Layer 8) depends only on this interface, never on the
Prisma implementation directly — that's what makes the service testable and
keeps the dependency arrow pointing inward.

```ts
export interface RecordMovementData {
  inventoryItemId: string;
  warehouseId: string;
  type: MovementType;
  quantity: number;
  note?: string;
  createdById: string;
}

export interface StockMovementRepository {
  findMany(query: MovementListQuery): Promise<Paginated<StockMovementWithRelations>>;
  findById(id: string): Promise<StockMovementWithRelations | null>;
  /**
   * Atomically inserts the movement row and adjusts the materialized item
   * quantity in one transaction. The quantity update is conditional
   * (`quantity >= qty` for outbound), so overselling is impossible even under
   * concurrent requests; implementations throw InsufficientStockError when
   * the guard fails.
   */
  applyMovement(data: RecordMovementData): Promise<StockMovementWithRelations>;
  updateMovement(id: string, patch: UpdateMovementData): Promise<StockMovementWithRelations>;
  deleteMovement(id: string): Promise<void>;
}
```

---

## Layer 11 — Repository implementation: the atomic guard

**File:** [`src/core/infrastructure/repositories/prisma-stock-movement-repository.ts`](src/core/infrastructure/repositories/prisma-stock-movement-repository.ts)
**Location in structure:** `src/core/infrastructure/repositories/` —
Infrastructure layer; the only code in the app that talks to Prisma for
stock movements.

```ts
export class PrismaStockMovementRepository implements StockMovementRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly ctx: TenantContext,
  ) {}

  async applyMovement(data: RecordMovementData): Promise<StockMovementWithRelations> {
    const delta = data.type === 'INBOUND' ? data.quantity : -data.quantity;

    const row = await this.db.$transaction(async (tx) => {
      // Conditional update is the authoritative stock guard: for outbound the
      // WHERE clause requires enough stock, so a concurrent competing
      // movement can never drive the quantity negative. The scope filter is
      // part of the same WHERE — a foreign item is simply "not found".
      const guard = await tx.inventoryItem.updateMany({
        where: {
          AND: [
            {
              organizationId: this.ctx.organizationId,
              ...(this.ctx.accessibleWarehouseIds !== null
                ? { warehouseId: { in: this.ctx.accessibleWarehouseIds } }
                : {}),
            },
            { id: data.inventoryItemId, warehouseId: data.warehouseId },
            ...(delta < 0 ? [{ quantity: { gte: data.quantity } }] : []),
          ],
        },
        data: { quantity: { increment: delta } },
      });

      if (guard.count === 0) {
        const item = await tx.inventoryItem.findFirst({
          where: {
            AND: [
              {
                organizationId: this.ctx.organizationId,
                ...(this.ctx.accessibleWarehouseIds !== null
                  ? { warehouseId: { in: this.ctx.accessibleWarehouseIds } }
                  : {}),
              },
              { id: data.inventoryItemId },
            ],
          },
          select: { sku: true, quantity: true },
        });
        if (!item) throw new NotFoundError('Inventory item', data.inventoryItemId);
        throw new InsufficientStockError(item.sku, data.quantity, item.quantity);
      }

      return tx.stockMovement.create({
        data: {
          organizationId: this.ctx.organizationId,
          warehouseId: data.warehouseId,
          inventoryItemId: data.inventoryItemId,
          type: data.type,
          quantity: data.quantity,
          note: data.note ?? null,
          createdById: data.createdById,
        },
        include: movementInclude,
      });
    });

    return toDto(row);
  }
}
```

**What runs, inside a single Postgres transaction (`$transaction`):**
1. `tx.inventoryItem.updateMany({ where: { AND: [...] }, data: { quantity:
   { increment: delta } } })` — this is the **entire concurrency-safety
   mechanism**. For an OUTBOUND movement (`delta < 0`), the `WHERE` clause
   includes `{ quantity: { gte: data.quantity } }` — Postgres will only match
   (and update) the row if it currently has enough stock. Two simultaneous
   outbound requests racing each other can't both succeed past zero, because
   whichever transaction commits second sees the already-decremented row and
   its `updateMany` matches **zero rows**.
2. `if (guard.count === 0)` — distinguishes *why* it failed (item doesn't
   exist / isn't in scope, vs. exists but doesn't have enough stock) purely
   for a better error message; either way nothing has been written yet.
3. `tx.stockMovement.create({...})` — only reached if the guard passed; the
   ledger row is created **inside the same transaction** as the quantity
   update, so the two can never be observed out of sync.
4. `toDto(row)` maps the Prisma row (joined with item/warehouse/creator via
   `movementInclude`) into the `StockMovementWithRelations` DTO the service
   returns.

---

## Layer 12 — Database schema (what the transaction actually writes)

**File:** [`prisma/schema.prisma`](prisma/schema.prisma)
**Location in structure:** `prisma/` — not under `src/` at all; this is the
Prisma schema that generates the client used at Layer 11 and defines the
Postgres tables the transaction touches.

```prisma
model InventoryItem {
  id             String   @id @default(cuid())
  organizationId String
  warehouseId    String
  sku            String
  name           String
  /// Materialized aggregate of stock movements; written only by
  /// StockMovementService inside the movement transaction. CHECK (quantity >= 0).
  quantity       Int      @default(0)
  storageUnitsPerItem Decimal @db.Decimal(12, 6) @default(1)
  // ...
  @@unique([warehouseId, sku])
  @@map("inventory_items")
}

model StockMovement {
  id              String       @id @default(cuid())
  organizationId  String
  warehouseId     String
  inventoryItemId String
  type            MovementType
  /// Units moved; always positive, direction comes from `type`. CHECK (quantity > 0).
  quantity        Int
  note            String?
  createdById     String
  occurredAt      DateTime     @default(now())

  organization  Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  warehouse     Warehouse     @relation(fields: [warehouseId], references: [id], onDelete: Cascade)
  inventoryItem InventoryItem @relation(fields: [inventoryItemId], references: [id], onDelete: Cascade)
  createdBy     User          @relation(fields: [createdById], references: [id])

  @@index([organizationId, occurredAt(sort: Desc)])
  @@index([warehouseId, occurredAt(sort: Desc)])
  @@index([inventoryItemId, occurredAt(sort: Desc)])
  @@map("stock_movements")
}
```

The `CHECK (quantity >= 0)` on `inventory_items` and `CHECK (quantity > 0)`
on `stock_movements` are the **final backstop** — even if application logic
had a bug, the database itself refuses an invalid write. `createdById` is a
`RESTRICT` foreign key, which is why a user with movement history can only
be deactivated, never deleted.

---

## Layer 13 — Response envelope back to the client

**File:** [`src/lib/api/response.ts`](src/lib/api/response.ts)
**Location in structure:** `src/lib/api/` — same folder as `handler.ts`
(Layer 4); this is the return trip's counterpart.

```ts
export function ok<T>(data: T, init?: { status?: number; meta?: PaginationMeta }): NextResponse {
  return NextResponse.json(
    { success: true, data, ...(init?.meta ? { meta: init.meta } : {}) },
    { status: init?.status ?? 200 },
  );
}

export function created<T>(data: T): NextResponse {
  return ok(data, { status: 201 });
}

const STATUS_BY_CODE: Record<DomainErrorCode, number> = {
  VALIDATION_ERROR: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404,
  CONFLICT: 409, INSUFFICIENT_STOCK: 409, CAPACITY_EXCEEDED: 409,
  BUSINESS_RULE_VIOLATION: 422,
};

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return failure('VALIDATION_ERROR', 'Request validation failed.', 400,
      error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  if (error instanceof DomainError) {
    return failure(error.code, error.message, STATUS_BY_CODE[error.code], error.details);
  }
  console.error('[api] Unhandled error:', error);
  return failure('INTERNAL_ERROR', 'An unexpected error occurred.', 500);
}
```

**Happy path:** Layer 3's `POST` handler calls `created(dto)` →
`{ success: true, data: {...}, }` with HTTP **201**.
**Any thrown error** (from Layers 4, 6, 8, or 11) is caught by `withApi`'s
`try/catch` (Layer 4) and passed through `toErrorResponse()` — e.g. an
`InsufficientStockError` thrown at Layer 11 becomes
`{ success: false, error: { code: 'INSUFFICIENT_STOCK', message: '...' } }`
with HTTP **409**.

---

## Back to Layer 1 — closing the loop

The response lands back in `apiFetch()` (Layer 2), which either returns
`{ data }` or throws `ApiError`. In the dialog (Layer 1):

```ts
toast.success(`${type === 'INBOUND' ? 'Received' : 'Shipped'} ${formatNumber(Number(quantity))} × ${selected.sku}.`);
onSaved();          // triggers SWR revalidation on the Movements/Inventory page
onOpenChange(false); // closes the dialog
```

or, on failure:

```ts
if (!applyApiError(err)) {
  toast.error(err instanceof ApiError ? err.message : 'Failed to record movement.');
}
```

`applyApiError` (from [`src/lib/client/validation.ts`](src/lib/client/validation.ts))
maps a `VALIDATION_ERROR`'s `details` array back onto per-field errors shown
inline in the form; anything else surfaces as a toast.

---

## Full call stack, one line per layer

```
1.  record-movement-dialog.tsx      MovementForm.submit()
2.  lib/client/api.ts                apiFetch('/api/v1/movements', POST)
        │  HTTP request
3.  app/api/v1/movements/route.ts    POST handler (Zod parse)
4.  lib/api/handler.ts               withApi() — session + permission gate
5.  lib/auth/session.ts              tryGetTenantContext()
6.  core/application/auth/
      permissions.ts                 authorize(ctx, MovementsCreate)  [check #1]
7.  core/infrastructure/
      container.ts                   createServices(ctx)
8.  core/application/services/
      stock-movement-service.ts      StockMovementService.record()
                                        authorize()  [check #2]
                                        InventoryRepository.findById()
                                        WarehouseRepository.findById() (+capacity math)
9.  core/domain/errors.ts            ValidationError / NotFoundError /
                                      InsufficientStockError / CapacityExceededError
10. core/application/ports/
      stock-movement-repository.ts   StockMovementRepository interface
11. core/infrastructure/repositories/
      prisma-stock-movement-repository.ts
                                        applyMovement() — $transaction:
                                          updateMany (conditional guard)
                                          stockMovement.create()
12. prisma/schema.prisma             InventoryItem / StockMovement tables + CHECK constraints
        │  Postgres commit
13. lib/api/response.ts              created(dto) → { success: true, data }
        │  HTTP response
2.  lib/client/api.ts                apiFetch resolves { data }
1.  record-movement-dialog.tsx       toast.success(); onSaved(); onOpenChange(false)
```
