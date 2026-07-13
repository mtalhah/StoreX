/**
 * Seeds StoreX's two real tenants — PVP Logistics and Majestic Electronics —
 * with warehouses, users, inventory, and ~90 days of stock-movement history
 * ending today. Idempotent: re-running replaces both tenants (and cleans up
 * the old single-tenant demo seed this file replaces, if present).
 *
 * Users are seeded unlinked (no workosUserId) by their real email address.
 * On first WorkOS sign-in, UserSyncService links that identity to the
 * matching row by email — see PrismaIdentityRepository.findUnlinkedByEmail.
 * No WorkOS Organization needs to be linked for this to work; that's only
 * needed if an admin later invites a *new* teammate through the app.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { MovementType, PrismaClient, UserRole } from '../src/generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Cleans up the old single-tenant demo seed this file replaces.
const LEGACY_DEMO_ORG_ID = 'org_demo_acme';

// Deterministic PRNG so the seed data is stable across re-runs.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260713);
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

interface CatalogItem {
  sku: string;
  name: string;
  storageUnitsPerItem: number;
}

// PVP Logistics: generic 3PL goods — illustrates the full capacity-ratio
// range, from dense consumables (labels) up through bulky equipment
// (pallets, hand trucks). See README "Warehouse capacity model".
const PVP_CATALOG: CatalogItem[] = [
  { sku: 'PKG-1001', name: 'Corrugated Box 40x30x30', storageUnitsPerItem: 0.02 },
  { sku: 'PKG-1002', name: 'Stretch Wrap Roll 500mm', storageUnitsPerItem: 0.05 },
  { sku: 'PKG-1003', name: 'Pallet EUR EPAL', storageUnitsPerItem: 4 },
  { sku: 'SAF-2001', name: 'High-Vis Safety Vest', storageUnitsPerItem: 0.01 },
  { sku: 'SAF-2002', name: 'Steel-Toe Boots Size 43', storageUnitsPerItem: 0.05 },
  { sku: 'EQP-3001', name: 'Hand Pallet Truck 2.5t', storageUnitsPerItem: 8 },
  { sku: 'EQP-3002', name: 'Picking Cart 3-Shelf', storageUnitsPerItem: 6 },
  { sku: 'ELC-4001', name: 'Wireless Barcode Scanner', storageUnitsPerItem: 0.05 },
  { sku: 'ELC-4002', name: 'Thermal Label Printer', storageUnitsPerItem: 0.3 },
  { sku: 'CON-5001', name: 'Zebra Ribbon 110mm', storageUnitsPerItem: 0.02 },
  { sku: 'CON-5002', name: 'Shipping Labels 100x150 (1k)', storageUnitsPerItem: 0.001 },
  { sku: 'FRT-6001', name: 'Standard Freight Dolly', storageUnitsPerItem: 3 },
];

// Majestic Electronics: consumer electronics — small accessories through
// bulky TVs.
const MAJESTIC_CATALOG: CatalogItem[] = [
  { sku: 'TV-1001', name: '55" 4K Smart TV', storageUnitsPerItem: 3.5 },
  { sku: 'TV-1002', name: '65" OLED TV', storageUnitsPerItem: 5 },
  { sku: 'LAP-2001', name: '14" Ultrabook Laptop', storageUnitsPerItem: 0.3 },
  { sku: 'LAP-2002', name: 'Gaming Laptop 17"', storageUnitsPerItem: 0.6 },
  { sku: 'AUD-3001', name: 'Wireless Earbuds', storageUnitsPerItem: 0.005 },
  { sku: 'AUD-3002', name: 'Over-Ear Headphones', storageUnitsPerItem: 0.05 },
  { sku: 'MOB-4001', name: 'Smartphone 128GB', storageUnitsPerItem: 0.01 },
  { sku: 'MOB-4002', name: 'USB-C Charger Cable', storageUnitsPerItem: 0.002 },
  { sku: 'SPK-5001', name: 'Smart Speaker', storageUnitsPerItem: 0.15 },
  { sku: 'SPK-5002', name: 'Soundbar', storageUnitsPerItem: 0.4 },
  { sku: 'CAM-6001', name: 'Security Camera', storageUnitsPerItem: 0.08 },
  { sku: 'ACC-7001', name: 'USB-C Hub', storageUnitsPerItem: 0.01 },
];

interface UserSeed {
  id: string;
  email: string;
  role: UserRole;
}

interface WarehouseSeed {
  id: string;
  name: string;
  location: string;
  capacity: number;
  /**
   * User ids allowed to record movements here — the assigned operator/
   * manager, weighted toward whoever does the day-to-day work; the LAST id
   * is used as the "opening stock" recorder. Never an admin (read-only on
   * movements). Empty = a real warehouse that just hasn't been stocked yet.
   */
  recorderIds: string[];
}

interface OrgSeed {
  orgId: string;
  orgName: string;
  users: UserSeed[];
  /** [userId, warehouseId] warehouse-access grants. */
  assignments: Array<[string, string]>;
  warehouses: WarehouseSeed[];
  catalog: CatalogItem[];
}

const PVP_ADMIN = 'usr_pvp_admin';
const PVP_MANAGER = 'usr_pvp_manager';
const PVP_OPERATOR = 'usr_pvp_operator';

const pvpSeed: OrgSeed = {
  orgId: 'org_pvp_logistics',
  orgName: 'PVP Logistics',
  users: [
    { id: PVP_ADMIN, email: 'mtalhah@gmail.com', role: UserRole.ADMIN },
    { id: PVP_MANAGER, email: 'thoufiq@gmail.com', role: UserRole.MANAGER },
    { id: PVP_OPERATOR, email: 'lumino640@gmail.com', role: UserRole.OPERATOR },
  ],
  assignments: [
    [PVP_MANAGER, 'wh_pvp_north'],
    [PVP_MANAGER, 'wh_pvp_central'],
    [PVP_MANAGER, 'wh_pvp_south'],
    [PVP_OPERATOR, 'wh_pvp_north'],
  ],
  warehouses: [
    // Operator is assigned only here (the "exactly one warehouse" rule), so
    // this site's movements skew operator-heavy; the manager covers all three.
    {
      id: 'wh_pvp_north',
      name: 'PVP North DC',
      location: 'Chicago, IL',
      capacity: 60_000,
      recorderIds: [PVP_OPERATOR, PVP_OPERATOR, PVP_MANAGER],
    },
    { id: 'wh_pvp_central', name: 'PVP Central Hub', location: 'Dallas, TX', capacity: 90_000, recorderIds: [PVP_MANAGER] },
    { id: 'wh_pvp_south', name: 'PVP South Depot', location: 'Atlanta, GA', capacity: 40_000, recorderIds: [PVP_MANAGER] },
  ],
  catalog: PVP_CATALOG,
};

const MAJESTIC_ADMIN = 'usr_majestic_admin';
const MAJESTIC_OPERATOR = 'usr_majestic_operator';

const majesticSeed: OrgSeed = {
  orgId: 'org_majestic_electronics',
  orgName: 'Majestic Electronics',
  users: [
    { id: MAJESTIC_ADMIN, email: 'nazrinthoufiq@gmail.com', role: UserRole.ADMIN },
    { id: MAJESTIC_OPERATOR, email: 'tazubair@gmail.com', role: UserRole.OPERATOR },
  ],
  assignments: [[MAJESTIC_OPERATOR, 'wh_majestic_main']],
  warehouses: [
    { id: 'wh_majestic_main', name: 'Majestic Main Warehouse', location: 'San Jose, CA', capacity: 50_000, recorderIds: [MAJESTIC_OPERATOR] },
    // No manager exists for this org and the operator is assigned to exactly
    // one warehouse (Main) — a second warehouse with nobody assigned would
    // have no one who could legitimately have recorded a movement there
    // (admins are read-only on movements), so this site is left unstocked
    // rather than inventing a fictional extra staff member.
    { id: 'wh_majestic_east', name: 'Majestic East DC', location: 'Newark, NJ', capacity: 35_000, recorderIds: [] },
  ],
  catalog: MAJESTIC_CATALOG,
};

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

async function seedOrganization(seed: OrgSeed): Promise<{ items: number; movements: number }> {
  await prisma.organization.deleteMany({ where: { id: seed.orgId } });
  await prisma.organization.create({ data: { id: seed.orgId, name: seed.orgName } });

  await Promise.all(
    seed.users.map((u) =>
      prisma.user.create({
        data: { id: u.id, email: u.email.toLowerCase(), role: u.role, organizationId: seed.orgId },
      }),
    ),
  );

  await Promise.all(
    seed.warehouses.map((w) =>
      prisma.warehouse.create({
        data: { id: w.id, name: w.name, location: w.location, capacity: w.capacity, organizationId: seed.orgId },
      }),
    ),
  );

  if (seed.assignments.length > 0) {
    await prisma.warehouseAssignment.createMany({
      data: seed.assignments.map(([userId, warehouseId]) => ({ userId, warehouseId })),
    });
  }

  let itemCount = 0;
  let movementCount = 0;

  for (const warehouse of seed.warehouses) {
    if (warehouse.recorderIds.length === 0) continue;

    // Each warehouse stocks a subset of its org's catalog.
    const skus = seed.catalog.filter(() => rand() < 0.75);

    for (const product of skus) {
      const item = await prisma.inventoryItem.create({
        data: {
          organizationId: seed.orgId,
          warehouseId: warehouse.id,
          sku: product.sku,
          name: product.name,
          quantity: 0,
          storageUnitsPerItem: product.storageUnitsPerItem,
        },
      });
      itemCount++;

      // Movement history: an opening inbound 90 days ago, then a random walk
      // that never goes negative. A few SKUs are "dead stock" (no recent
      // movements); a few are "fast movers" (high-frequency, high-volume).
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
        createdById: warehouse.recorderIds[warehouse.recorderIds.length - 1],
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
            createdById: pick(warehouse.recorderIds),
          });
        } else {
          const qty = randInt(20, isFastMover ? 200 : 80);
          quantity += qty;
          movements.push({
            type: MovementType.INBOUND,
            quantity: qty,
            occurredAt: new Date(now - day * DAY + randInt(6, 20) * 60 * 60 * 1000),
            createdById: pick(warehouse.recorderIds),
          });
        }
      }

      await prisma.stockMovement.createMany({
        data: movements.map((m) => ({
          ...m,
          organizationId: seed.orgId,
          warehouseId: warehouse.id,
          inventoryItemId: item.id,
        })),
      });
      movementCount += movements.length;

      await prisma.inventoryItem.update({ where: { id: item.id }, data: { quantity } });
    }
  }

  return { items: itemCount, movements: movementCount };
}

async function main() {
  console.log('Seeding PVP Logistics and Majestic Electronics…');

  await prisma.organization.deleteMany({ where: { id: LEGACY_DEMO_ORG_ID } });

  const pvp = await seedOrganization(pvpSeed);
  const majestic = await seedOrganization(majesticSeed);

  console.log(
    `Seeded PVP Logistics: 3 users, 3 warehouses, ${pvp.items} inventory items, ${pvp.movements} stock movements.`,
  );
  console.log(
    `Seeded Majestic Electronics: 2 users, 2 warehouses (1 stocked), ${majestic.items} inventory items, ${majestic.movements} stock movements.`,
  );
  console.log('\nSign in with the WorkOS accounts already provisioned for these emails:');
  console.log('  PVP Logistics       — admin: mtalhah@gmail.com · manager: thoufiq@gmail.com · operator: lumino640@gmail.com');
  console.log('  Majestic Electronics — admin: nazrinthoufiq@gmail.com · operator: tazubair@gmail.com');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
