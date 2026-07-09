/**
 * End-to-end smoke test for the core layers, run against a seeded local
 * database (docker compose + `prisma migrate deploy` + `prisma db seed`).
 * Exercises the real services and repositories — the same code the API uses —
 * asserting the authorization, tenant-scoping, and stock invariants hold.
 *
 *   npm run smoke
 */
import 'dotenv/config';
import { UserSyncService } from '@/core/application/services/user-sync-service';
import { createServices } from '@/core/infrastructure/container';
import { prisma } from '@/core/infrastructure/db/prisma';
import { PrismaIdentityRepository } from '@/core/infrastructure/repositories/prisma-identity-repository';
import {
  DomainError,
  ForbiddenError,
  InsufficientStockError,
  NotFoundError,
} from '@/core/domain/errors';

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
  await expectError('operator cannot view analytics', ForbiddenError, () => operator.analytics.kpis());

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

  console.log('\nAnalytics (dev source: postgres implementation of the port)');
  const managerKpis = await manager.analytics.kpis();
  const adminKpis = await admin.analytics.kpis();
  check('KPIs return stock for the manager scope', managerKpis.totalStockUnits > 0);
  check(
    'admin sees at least as much stock as a scoped manager',
    adminKpis.totalStockUnits >= managerKpis.totalStockUnits,
  );
  const trend = await manager.analytics.movementTrend(30);
  check('trend returns one point per day', trend.length === 30);
  const utilization = await manager.analytics.warehouseUtilization();
  check('utilization rows respect manager scope (2 warehouses)', utilization.length === 2);

  console.log(failures === 0 ? '\nAll smoke checks passed.' : `\n${failures} check(s) FAILED.`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
