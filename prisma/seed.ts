/**
 * Seeds a demo tenant with warehouses, users, inventory, and ~90 days of
 * stock-movement history. Idempotent: re-running replaces the demo tenant.
 *
 * User emails can be overridden so you can sign in with a real WorkOS account:
 *   SEED_ADMIN_EMAIL / SEED_MANAGER_EMAIL / SEED_OPERATOR_EMAIL
 * On first sign-in, UserSyncService links the WorkOS user to the seeded row
 * by email.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { MovementType, PrismaClient, UserRole } from '../src/generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const ORG_ID = 'org_demo_acme';

// Deterministic PRNG so the demo data is stable across runs.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260709);
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

const CATALOG: Array<{ sku: string; name: string }> = [
  { sku: 'ELC-1001', name: 'Wireless Barcode Scanner' },
  { sku: 'ELC-1002', name: 'Thermal Label Printer' },
  { sku: 'ELC-1003', name: 'Rugged Handheld Terminal' },
  { sku: 'PKG-2001', name: 'Corrugated Box 40x30x30' },
  { sku: 'PKG-2002', name: 'Stretch Wrap Roll 500mm' },
  { sku: 'PKG-2003', name: 'Pallet EUR EPAL' },
  { sku: 'SAF-3001', name: 'High-Vis Safety Vest' },
  { sku: 'SAF-3002', name: 'Steel-Toe Boots Size 43' },
  { sku: 'EQP-4001', name: 'Hand Pallet Truck 2.5t' },
  { sku: 'EQP-4002', name: 'Picking Cart 3-Shelf' },
  { sku: 'CON-5001', name: 'Zebra Ribbon 110mm' },
  { sku: 'CON-5002', name: 'Shipping Labels 100x150 (1k)' },
];

async function main() {
  console.log('Seeding demo tenant…');

  // Replace any previous demo tenant (cascades to all owned rows).
  await prisma.organization.deleteMany({ where: { id: ORG_ID } });

  const org = await prisma.organization.create({
    data: { id: ORG_ID, name: 'Acme Logistics' },
  });

  const [admin, manager1, manager2, operator1, operator2, operator3] = await Promise.all(
    (
      [
        { id: 'usr_demo_admin', email: process.env.SEED_ADMIN_EMAIL ?? 'admin@storex.dev', firstName: 'Ava', lastName: 'Stone', role: UserRole.ADMIN },
        { id: 'usr_demo_manager1', email: process.env.SEED_MANAGER_EMAIL ?? 'manager@storex.dev', firstName: 'Marcus', lastName: 'Reid', role: UserRole.MANAGER },
        { id: 'usr_demo_manager2', email: 'manager2@storex.dev', firstName: 'Lena', lastName: 'Vogel', role: UserRole.MANAGER },
        { id: 'usr_demo_operator1', email: process.env.SEED_OPERATOR_EMAIL ?? 'operator@storex.dev', firstName: 'Omar', lastName: 'Haddad', role: UserRole.OPERATOR },
        { id: 'usr_demo_operator2', email: 'operator2@storex.dev', firstName: 'Priya', lastName: 'Nair', role: UserRole.OPERATOR },
        { id: 'usr_demo_operator3', email: 'operator3@storex.dev', firstName: 'Jonas', lastName: 'Berg', role: UserRole.OPERATOR },
      ] as const
    ).map((u) => prisma.user.create({ data: { ...u, organizationId: org.id } })),
  );

  const [wh1, wh2, wh3] = await Promise.all(
    [
      { id: 'wh_demo_north', name: 'North Fulfillment Center', location: 'Rotterdam, NL', capacity: 50_000 },
      { id: 'wh_demo_central', name: 'Central Distribution Hub', location: 'Frankfurt, DE', capacity: 80_000 },
      { id: 'wh_demo_south', name: 'South Depot', location: 'Milan, IT', capacity: 30_000 },
    ].map((w) => prisma.warehouse.create({ data: { ...w, organizationId: org.id } })),
  );

  // Manager 1 runs North + Central, Manager 2 runs South.
  // Operators are assigned to exactly one warehouse each.
  await prisma.warehouseAssignment.createMany({
    data: [
      { userId: manager1.id, warehouseId: wh1.id },
      { userId: manager1.id, warehouseId: wh2.id },
      { userId: manager2.id, warehouseId: wh3.id },
      { userId: operator1.id, warehouseId: wh1.id },
      { userId: operator2.id, warehouseId: wh2.id },
      { userId: operator3.id, warehouseId: wh3.id },
    ],
  });

  const warehouses = [
    { warehouse: wh1, operator: operator1, manager: manager1 },
    { warehouse: wh2, operator: operator2, manager: manager1 },
    { warehouse: wh3, operator: operator3, manager: manager2 },
  ];

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  let itemCount = 0;
  let movementCount = 0;

  for (const { warehouse, operator, manager } of warehouses) {
    // Each warehouse stocks a subset of the catalog.
    const skus = [...CATALOG].filter(() => rand() < 0.75);

    for (const product of skus) {
      const item = await prisma.inventoryItem.create({
        data: {
          organizationId: org.id,
          warehouseId: warehouse.id,
          sku: product.sku,
          name: product.name,
          quantity: 0,
        },
      });
      itemCount++;

      // Movement history: an opening inbound, then a random walk that never
      // goes negative. A few SKUs are "dead stock" (no recent movements).
      const isDeadStock = rand() < 0.12;
      const isFastMover = !isDeadStock && rand() < 0.25;
      let quantity = 0;
      const movements: Array<{
        type: MovementType;
        quantity: number;
        occurredAt: Date;
        createdById: string;
        note?: string;
      }> = [];

      const opening = randInt(200, 1_500);
      quantity += opening;
      movements.push({
        type: MovementType.INBOUND,
        quantity: opening,
        occurredAt: new Date(now - 90 * DAY + randInt(0, 12) * 60 * 60 * 1000),
        createdById: manager.id,
        note: 'Opening stock',
      });

      const activityDays = isDeadStock ? 30 : 88; // dead stock stops moving after day ~60
      const movesPerWeek = isFastMover ? 9 : 3;
      for (let day = 89; day >= 90 - activityDays; day--) {
        if (rand() > movesPerWeek / 7) continue;
        const outbound = rand() < 0.55;
        if (outbound) {
          if (quantity === 0) continue;
          const qty = Math.min(quantity, randInt(5, isFastMover ? 120 : 40));
          quantity -= qty;
          movements.push({
            type: MovementType.OUTBOUND,
            quantity: qty,
            occurredAt: new Date(now - day * DAY + randInt(6, 20) * 60 * 60 * 1000),
            createdById: pick([operator.id, operator.id, manager.id]),
          });
        } else {
          const qty = randInt(20, isFastMover ? 200 : 80);
          quantity += qty;
          movements.push({
            type: MovementType.INBOUND,
            quantity: qty,
            occurredAt: new Date(now - day * DAY + randInt(6, 20) * 60 * 60 * 1000),
            createdById: pick([operator.id, manager.id]),
          });
        }
      }

      await prisma.stockMovement.createMany({
        data: movements.map((m) => ({
          ...m,
          organizationId: org.id,
          warehouseId: warehouse.id,
          inventoryItemId: item.id,
        })),
      });
      movementCount += movements.length;

      await prisma.inventoryItem.update({
        where: { id: item.id },
        data: { quantity },
      });
    }
  }

  console.log(
    `Seeded: 1 organization, 6 users, 3 warehouses, ${itemCount} inventory items, ${movementCount} stock movements.`,
  );
  console.log(`Admin sign-in email:    ${admin.email}`);
  console.log(`Manager sign-in email:  ${manager1.email}`);
  console.log(`Operator sign-in email: ${operator1.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
