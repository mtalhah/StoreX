/**
 * End-to-end smoke test for the core layers, run against a seeded local
 * database (docker compose + `prisma migrate deploy` + `prisma db seed`).
 * Exercises the real services and repositories — the same code the API uses —
 * asserting the authorization, tenant-scoping, and stock invariants hold.
 *
 *   npm run smoke
 */
import 'dotenv/config';
import type {
  AuthDirectory,
  SendInvitationInput,
  SentInvitation,
} from '@/core/application/ports/auth-directory';
import { UserSyncService } from '@/core/application/services/user-sync-service';
import { createServices } from '@/core/infrastructure/container';
import { prisma } from '@/core/infrastructure/db/prisma';
import { PrismaIdentityRepository } from '@/core/infrastructure/repositories/prisma-identity-repository';
import {
  BusinessRuleViolationError,
  CapacityExceededError,
  DomainError,
  ForbiddenError,
  InsufficientStockError,
  NotFoundError,
} from '@/core/domain/errors';

/** Records every invitation it "sends" and returns a deterministic result — simulates a healthy WorkOS. */
class FakeAuthDirectory implements AuthDirectory {
  sentInvitations: SendInvitationInput[] = [];
  async createOrganization(name: string): Promise<string | null> {
    return `org_fake_${name}`;
  }
  async addOrganizationMembership(): Promise<boolean> {
    return true;
  }
  async sendInvitation(input: SendInvitationInput): Promise<SentInvitation> {
    this.sentInvitations.push(input);
    return {
      id: `invitation_fake_${this.sentInvitations.length}`,
      token: 'fake-token',
      acceptUrl: 'https://example.com/accept',
    };
  }
}

/** Every call throws — simulates a WorkOS outage regardless of NODE_ENV. */
class FailingAuthDirectory implements AuthDirectory {
  async createOrganization(): Promise<string | null> {
    throw new Error('simulated WorkOS outage');
  }
  async addOrganizationMembership(): Promise<boolean> {
    throw new Error('simulated WorkOS outage');
  }
  async sendInvitation(): Promise<SentInvitation | null> {
    throw new Error('simulated WorkOS outage');
  }
}

let failures = 0;

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function expectError(
  name: string,
  errorClass: abstract new (...args: never[]) => DomainError,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
    check(name, false, `expected ${errorClass.name}, got success`);
  } catch (e) {
    check(name, e instanceof errorClass, `expected ${errorClass.name}, got ${String(e)}`);
  }
}

async function contextFor(seedUserId: string) {
  const identity = new PrismaIdentityRepository(prisma);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: seedUserId },
    select: { workosUserId: true, email: true },
  });
  // The smoke test bypasses WorkOS: it builds the context straight from the
  // seeded user, exactly like UserSyncService does after verification.
  const withAccess = user.workosUserId
    ? await identity.findByWorkosUserId(user.workosUserId)
    : await identity.findUnlinkedByEmail(user.email);
  if (!withAccess) throw new Error(`Seed user ${seedUserId} not found — run prisma db seed first.`);
  return UserSyncService.toTenantContext(withAccess);
}

/**
 * Services for a MANAGER/OPERATOR assigned to `warehouseId`. Admins are now
 * read-only over movements/inventory (separation of duties), so capacity and
 * stock checks must run as an operational role that actually holds the
 * warehouse — this finds one regardless of which warehouse an item lands in.
 */
async function recorderFor(warehouseId: string) {
  const assignment = await prisma.warehouseAssignment.findFirstOrThrow({
    where: { warehouseId, user: { role: { in: ['MANAGER', 'OPERATOR'] } } },
    select: { userId: true },
  });
  return createServices(await contextFor(assignment.userId));
}

async function main() {
  const adminCtx = await contextFor('usr_demo_admin');
  const managerCtx = await contextFor('usr_demo_manager1'); // North + Central
  const operatorCtx = await contextFor('usr_demo_operator1'); // North only

  const admin = createServices(adminCtx);
  const manager = createServices(managerCtx);
  const operator = createServices(operatorCtx);

  console.log('\nWarehouse scoping');
  const listQuery = { page: 1, pageSize: 50, sortBy: 'name', sortDir: 'asc' } as const;
  check('admin sees all 3 warehouses', (await admin.warehouses.list(listQuery)).totalItems === 3);
  check('manager sees 2 assigned warehouses', (await manager.warehouses.list(listQuery)).totalItems === 2);
  check('operator sees exactly 1 warehouse', (await operator.warehouses.list(listQuery)).totalItems === 1);

  console.log('\nCross-scope access is indistinguishable from "not found"');
  await expectError('operator cannot read the South depot', NotFoundError, () =>
    operator.warehouses.get('wh_demo_south'),
  );
  const southItem = await prisma.inventoryItem.findFirstOrThrow({
    where: { warehouseId: 'wh_demo_south' },
  });
  await expectError('operator cannot read inventory of another warehouse', NotFoundError, () =>
    operator.inventory.get(southItem.id),
  );
  await expectError('operator cannot move stock in another warehouse', NotFoundError, () =>
    operator.movements.record({ inventoryItemId: southItem.id, type: 'INBOUND', quantity: 1 }),
  );

  console.log('\nPermission matrix');
  await expectError('operator cannot list users', ForbiddenError, () =>
    operator.users.list({ page: 1, pageSize: 10, sortBy: 'email', sortDir: 'asc' }),
  );
  await expectError('manager cannot create warehouses', ForbiddenError, () =>
    manager.warehouses.create({ name: 'X', location: 'Y', capacity: 10 }),
  );
  // Admin is read-only over operational data (separation of duties): the
  // authorize() guard fires before any lookup, so the placeholder ids never
  // matter.
  await expectError('admin cannot record stock movements', ForbiddenError, () =>
    admin.movements.record({ inventoryItemId: 'anything', type: 'INBOUND', quantity: 1 }),
  );
  await expectError('admin cannot create inventory items', ForbiddenError, () =>
    admin.inventory.create({ warehouseId: 'anything', sku: 'X', name: 'Y' }),
  );
  // Operators now have analytics (scoped to their warehouse) and inventory
  // management (both new grants).
  const operatorKpis = await operator.analytics.kpis(30);
  check('operator can view analytics for their warehouse', Number.isFinite(operatorKpis.activeSkus));
  await prisma.inventoryItem.deleteMany({ where: { warehouseId: 'wh_demo_north', sku: 'SMOKE-OP-1' } });
  const operatorItem = await operator.inventory.create({
    warehouseId: 'wh_demo_north',
    sku: 'SMOKE-OP-1',
    name: 'Operator-created item',
  });
  check('operator can create inventory in their warehouse', operatorItem.sku === 'SMOKE-OP-1');
  await operator.inventory.remove(operatorItem.id);

  console.log('\nWorkOS invitations on user creation');
  const fakeDirectory = new FakeAuthDirectory();
  const adminWithFakeDirectory = createServices(adminCtx, { directory: fakeDirectory });
  await prisma.user.deleteMany({ where: { email: 'smoke-invite@example.com' } });
  const invitedUser = await adminWithFakeDirectory.users.create({
    email: 'smoke-invite@example.com',
    role: 'OPERATOR',
    warehouseIds: ['wh_demo_north'],
  });
  check(
    'creating a user sends a WorkOS invitation for the tenant organization',
    fakeDirectory.sentInvitations.length === 1 &&
      fakeDirectory.sentInvitations[0].email === 'smoke-invite@example.com',
  );
  check(
    'created user is PENDING with the invitation id WorkOS returned',
    invitedUser.invitationStatus === 'PENDING' && invitedUser.workosInvitationId === 'invitation_fake_1',
  );

  console.log('\nA failed WorkOS invitation blocks user creation entirely');
  const adminWithFailingDirectory = createServices(adminCtx, { directory: new FailingAuthDirectory() });
  await prisma.user.deleteMany({ where: { email: 'smoke-invite-fail@example.com' } });
  await expectError(
    'user is not created when the WorkOS invitation cannot be sent',
    BusinessRuleViolationError,
    () =>
      adminWithFailingDirectory.users.create({
        email: 'smoke-invite-fail@example.com',
        role: 'OPERATOR',
        warehouseIds: ['wh_demo_north'],
      }),
  );
  const leaked = await prisma.user.findFirst({ where: { email: 'smoke-invite-fail@example.com' } });
  check('no local user row exists after a failed invitation', leaked === null);

  console.log('\nAn invited user links by email on first sign-in and flips to ACCEPTED');
  const identityRepo = new PrismaIdentityRepository(prisma);
  const linkedInvitee = await identityRepo.linkWorkosUser(invitedUser.id, 'user_workos_smoke_invite', {});
  check('linking sets invitationStatus to ACCEPTED', linkedInvitee.invitationStatus === 'ACCEPTED');

  console.log('\nStock movement invariants');
  const northItem = await prisma.inventoryItem.findFirstOrThrow({
    where: { warehouseId: 'wh_demo_north', quantity: { gt: 10 } },
  });
  await expectError('outbound larger than on-hand is rejected', InsufficientStockError, () =>
    operator.movements.record({
      inventoryItemId: northItem.id,
      type: 'OUTBOUND',
      quantity: northItem.quantity + 1,
    }),
  );
  const before = northItem.quantity;
  await operator.movements.record({
    inventoryItemId: northItem.id,
    type: 'INBOUND',
    quantity: 7,
    note: 'smoke-test',
  });
  const afterIn = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: northItem.id } });
  check('inbound movement increments quantity atomically', afterIn.quantity === before + 7);
  await operator.movements.record({
    inventoryItemId: northItem.id,
    type: 'OUTBOUND',
    quantity: 7,
    note: 'smoke-test revert',
  });
  const afterOut = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: northItem.id } });
  check('outbound movement decrements quantity atomically', afterOut.quantity === before);

  console.log('\nCapacity is weighted by storageUnitsPerItem, not raw quantity');
  const bulkyItem = await prisma.inventoryItem.findFirstOrThrow({
    where: { organizationId: 'org_demo_acme', storageUnitsPerItem: { gte: 2 } },
  });
  const bulkyWarehouse = await admin.warehouses.get(bulkyItem.warehouseId);
  check(
    'usedCapacity differs from raw totalQuantity once a ratio is not 1',
    bulkyWarehouse.usedCapacity !== bulkyWarehouse.totalQuantity,
  );

  // Cross-check the repository's usedCapacity against an independent
  // recomputation straight from the raw rows.
  const rowsInBulkyWarehouse = await prisma.inventoryItem.findMany({
    where: { warehouseId: bulkyWarehouse.id },
    select: { quantity: true, storageUnitsPerItem: true },
  });
  const expectedUsedCapacity = rowsInBulkyWarehouse.reduce(
    (sum, r) => sum + r.quantity * Number(r.storageUnitsPerItem),
    0,
  );
  check(
    'usedCapacity matches an independent recomputation of quantity * storageUnitsPerItem',
    Math.abs(bulkyWarehouse.usedCapacity - expectedUsedCapacity) < 0.01,
  );

  // A bulky item should be rejected once quantity * storageUnitsPerItem
  // would exceed capacity — this is the bug the feature fixes: previously
  // capacity was compared against raw quantity, so a bulky item could
  // silently overfill a warehouse.
  const bulkyRatio = Number(bulkyItem.storageUnitsPerItem);
  const bulkyRemaining = bulkyWarehouse.capacity - bulkyWarehouse.usedCapacity;
  const overCapacityQty = Math.floor(bulkyRemaining / bulkyRatio) + 10;
  const bulkyRecorder = await recorderFor(bulkyItem.warehouseId);
  await expectError(
    'a bulky item is rejected once its weighted quantity would exceed capacity',
    CapacityExceededError,
    () => bulkyRecorder.movements.record({ inventoryItemId: bulkyItem.id, type: 'INBOUND', quantity: overCapacityQty }),
  );

  // A tiny-ratio item should NOT be rejected for a quantity that would only
  // trip a raw-quantity check — the other half of the same bug.
  const tinyItem = await prisma.inventoryItem.findFirstOrThrow({
    where: { organizationId: 'org_demo_acme', storageUnitsPerItem: { lte: 0.01 } },
  });
  const tinyWarehouse = await admin.warehouses.get(tinyItem.warehouseId);
  const tinyRatio = Number(tinyItem.storageUnitsPerItem);
  const tinyRemaining = tinyWarehouse.capacity - tinyWarehouse.usedCapacity;
  const tinyQty = Math.min(5000, Math.floor((tinyRemaining / tinyRatio) * 0.5));
  const tinyRecorder = await recorderFor(tinyItem.warehouseId);
  await tinyRecorder.movements.record({ inventoryItemId: tinyItem.id, type: 'INBOUND', quantity: tinyQty, note: 'smoke-test' });
  const tinyAfterIn = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: tinyItem.id } });
  check(
    'a tiny-ratio item accepts a large quantity without hitting capacity',
    tinyAfterIn.quantity === tinyItem.quantity + tinyQty,
  );
  await tinyRecorder.movements.record({ inventoryItemId: tinyItem.id, type: 'OUTBOUND', quantity: tinyQty, note: 'smoke-test revert' });

  console.log('\nTenant integrity on inventory creation');
  // Fixed ids + upsert: a second tenant that persists across smoke runs
  // instead of accumulating throwaway rows each time.
  const foreignOrg = await prisma.organization.upsert({
    where: { id: 'org_smoke_foreign' },
    create: { id: 'org_smoke_foreign', name: 'Smoke Test Foreign Org' },
    update: {},
  });
  const foreignWarehouse = await prisma.warehouse.upsert({
    where: { id: 'wh_smoke_foreign' },
    create: {
      id: 'wh_smoke_foreign',
      organizationId: foreignOrg.id,
      name: 'Foreign WH',
      location: 'Nowhere',
      capacity: 100,
    },
    update: {},
  });
  // Checked via a MANAGER (admins can't create inventory at all now): the
  // foreign warehouse is outside their scope, so the scoped findById returns
  // null and the create is a NotFound rather than an FK/tenant leak.
  await expectError(
    "a manager cannot create an inventory item against another organization's warehouse",
    NotFoundError,
    () =>
      manager.inventory.create({
        warehouseId: foreignWarehouse.id,
        sku: 'SMOKE-X',
        name: 'Should not be created',
      }),
  );

  console.log('\nAnalytics (dev source: postgres implementation of the port)');
  const managerKpis = await manager.analytics.kpis(30);
  const adminKpis = await admin.analytics.kpis(30);
  check('KPIs return stock for the manager scope', managerKpis.totalStockUnits > 0);
  check(
    'admin sees at least as much stock as a scoped manager',
    adminKpis.totalStockUnits >= managerKpis.totalStockUnits,
  );
  const trend = await manager.analytics.movementTrend(30);
  check('trend returns one point per day', trend.length === 30);
  const utilization = await manager.analytics.warehouseUtilization();
  check('utilization rows respect manager scope (2 warehouses)', utilization.length === 2);

  // Regression check: totalStockUnits (and inbound/outboundInPeriod) must be
  // storage-unit-weighted, not raw sum(quantity) — otherwise a warehouse
  // full of bulky pallets would under-report and one full of tiny
  // consumables would over-report, exactly the bug this feature fixes.
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rawQtyOnHand = await prisma.inventoryItem
    .aggregate({ where: { organizationId: 'org_demo_acme' }, _sum: { quantity: true } })
    .then((r) => r._sum.quantity ?? 0);
  const expectedWeightedOnHand = (
    await prisma.inventoryItem.findMany({
      where: { organizationId: 'org_demo_acme' },
      select: { quantity: true, storageUnitsPerItem: true },
    })
  ).reduce((sum, i) => sum + i.quantity * Number(i.storageUnitsPerItem), 0);
  check(
    'admin totalStockUnits is storage-unit-weighted, not a raw quantity sum',
    adminKpis.totalStockUnits !== rawQtyOnHand &&
      Math.abs(adminKpis.totalStockUnits - expectedWeightedOnHand) < 0.01,
  );

  const expectedWeightedInbound30d = (
    await prisma.stockMovement.findMany({
      where: { organizationId: 'org_demo_acme', type: 'INBOUND', occurredAt: { gte: since30d } },
      select: { quantity: true, inventoryItem: { select: { storageUnitsPerItem: true } } },
    })
  ).reduce((sum, m) => sum + m.quantity * Number(m.inventoryItem.storageUnitsPerItem), 0);
  check(
    'admin inboundInPeriod matches an independent storage-unit-weighted recomputation',
    Math.abs(adminKpis.inboundInPeriod - expectedWeightedInbound30d) < 0.01,
  );

  console.log(failures === 0 ? '\nAll smoke checks passed.' : `\n${failures} check(s) FAILED.`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
