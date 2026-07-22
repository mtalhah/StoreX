/**
 * Load-testing add-on for the base seed (prisma/seed.ts): generates ~200,000
 * synthetic inventory items + stock movements across the 5 warehouses the
 * base seed already created, to exercise the app at realistic-scale data
 * volumes without bloating the everyday demo seed.
 *
 * Run `npm run db:seed` first — this script looks up the existing
 * organizations/warehouses/warehouse-assignments and fails if they're
 * missing. Idempotent: synthetic rows are tagged with a `SYN-` sku prefix
 * and deleted/recreated per warehouse on every run; hero-catalog data from
 * the base seed is untouched.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { MovementType, Prisma, PrismaClient } from '../src/generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260722);
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const WINDOW_DAYS = 180; // matches the dashboard's widest period option
const ITEM_CHUNK = 1000;
const MOVEMENT_CHUNK = 1000;
const QUANTITY_UPDATE_CHUNK = 1000;

// Weighted so a handful of warehouses (bigger capacity) get proportionally
// more SKUs — mirrors real catalogs where a bigger DC just stocks more.
const WAREHOUSE_TARGETS: Record<string, { shortCode: string; itemCount: number }> = {
  wh_pvp_north: { shortCode: 'pvpn', itemCount: 2200 },
  wh_pvp_central: { shortCode: 'pvpc', itemCount: 3300 },
  wh_pvp_south: { shortCode: 'pvps', itemCount: 1450 },
  wh_majestic_main: { shortCode: 'mjm', itemCount: 1800 },
  wh_majestic_east: { shortCode: 'mje', itemCount: 1250 },
};

// Bucketed (not a flat uniform pick) and weighted toward small ratios, same
// shape as real catalogs: mostly small/medium consumables, a minority of
// bulky equipment. This also bounds worst-case capacity contribution — a
// uniform pick let rare bulky-ratio items combine with a high quantity and
// blow out a warehouse's used capacity.
const SMALL_RATIOS = [0.005, 0.01, 0.02, 0.05, 0.1];
const MEDIUM_RATIOS = [0.3, 0.5, 1];
const BULKY_RATIOS = [2, 3, 5, 8];

type RatioBucket = 'SMALL' | 'MEDIUM' | 'BULKY';
function pickRatio(): { ratio: number; bucket: RatioBucket } {
  const r = rand();
  if (r < 0.55) return { ratio: pick(SMALL_RATIOS), bucket: 'SMALL' };
  if (r < 0.85) return { ratio: pick(MEDIUM_RATIOS), bucket: 'MEDIUM' };
  return { ratio: pick(BULKY_RATIOS), bucket: 'BULKY' };
}

type Tier = 'SLOW' | 'NORMAL' | 'HOT';
// Bulky items (pallets, equipment) are realistically slow movers — forcing
// this also keeps a rare high-ratio item from also drawing a large quantity.
function pickTier(bucket: RatioBucket): Tier {
  if (bucket === 'BULKY') return 'SLOW';
  const r = rand();
  if (r < 0.65) return 'SLOW';
  if (r < 0.9) return 'NORMAL';
  return 'HOT';
}
// The final on-hand quantity level each item's movements wobble around —
// calibrated so sum(quantity * storageUnitsPerItem) across a warehouse's
// synthetic items lands around 35-45% utilization (see prisma/seed-scale
// simulation notes), not multiples of capacity.
function targetQuantityFor(tier: Tier): number {
  if (tier === 'SLOW') return randInt(2, 15);
  if (tier === 'NORMAL') return randInt(12, 50);
  return randInt(30, 100);
}
function movementCountFor(tier: Tier): number {
  if (tier === 'SLOW') return randInt(2, 10);
  if (tier === 'NORMAL') return randInt(12, 35);
  return randInt(50, 150);
}

interface MovementRow {
  id: string;
  type: MovementType;
  quantity: number;
  dayOffset: number;
  createdById: string;
  note?: string;
}

// Opening stock sets the item at its target level; subsequent movements are
// a SYMMETRIC in/out wobble (same magnitude range either direction) around
// that level, so the balance oscillates near the target instead of
// systematically drifting — an earlier asymmetric version (bigger inbound
// range than outbound) let quantities balloon into the thousands over many
// movements, blowing warehouse utilization past 3000%.
function genMovements(
  idPrefix: string,
  tier: Tier,
  target: number,
  recorderIds: string[],
): { movements: MovementRow[]; finalQuantity: number } {
  const total = movementCountFor(tier);
  const movements: MovementRow[] = [];
  let quantity = target;
  movements.push({
    id: `${idPrefix}_000`,
    type: MovementType.INBOUND,
    quantity,
    dayOffset: WINDOW_DAYS - 1,
    createdById: recorderIds[recorderIds.length - 1],
    note: 'Opening stock',
  });

  const extra = total - 1;
  const oldestDay = WINDOW_DAYS - 2;
  const wobbleMax = Math.max(1, Math.round(target * 0.3));
  for (let i = 0; i < extra; i++) {
    const dayOffset = Math.max(0, Math.round(oldestDay - (i / Math.max(extra - 1, 1)) * oldestDay));
    const qty = randInt(1, wobbleMax);
    const outbound = quantity > 0 && rand() < 0.5;
    if (outbound) {
      const applied = Math.min(quantity, qty);
      quantity -= applied;
      movements.push({
        id: `${idPrefix}_${String(i + 1).padStart(3, '0')}`,
        type: MovementType.OUTBOUND,
        quantity: applied,
        dayOffset,
        createdById: pick(recorderIds),
      });
    } else {
      quantity += qty;
      movements.push({
        id: `${idPrefix}_${String(i + 1).padStart(3, '0')}`,
        type: MovementType.INBOUND,
        quantity: qty,
        dayOffset,
        createdById: pick(recorderIds),
      });
    }
  }

  return { movements, finalQuantity: quantity };
}

async function seedWarehouse(warehouseId: string, shortCode: string, itemCount: number) {
  const warehouse = await prisma.warehouse.findUnique({
    where: { id: warehouseId },
    include: { assignments: true },
  });
  if (!warehouse) {
    throw new Error(`Warehouse ${warehouseId} not found — run "npm run db:seed" first.`);
  }
  const recorderIds = warehouse.assignments.map((a) => a.userId);
  if (recorderIds.length === 0) {
    throw new Error(`Warehouse ${warehouseId} has no warehouse-assignment rows to record movements as.`);
  }

  // Clean up this warehouse's synthetic rows from a prior run — cascades to
  // their stock_movements — without touching the hero-catalog SKUs.
  await prisma.inventoryItem.deleteMany({ where: { warehouseId, sku: { startsWith: 'SYN-' } } });

  const now = Date.now();
  const items: Prisma.InventoryItemCreateManyInput[] = [];
  const quantityByItemId = new Map<string, number>();
  const allMovements: Prisma.StockMovementCreateManyInput[] = [];

  for (let i = 0; i < itemCount; i++) {
    const seq = String(i).padStart(6, '0');
    const itemId = `itm_syn_${shortCode}_${seq}`;
    const sku = `SYN-${shortCode.toUpperCase()}-${seq}`;

    const { ratio, bucket } = pickRatio();
    items.push({
      id: itemId,
      organizationId: warehouse.organizationId,
      warehouseId,
      sku,
      name: `Synthetic Item ${seq}`,
      quantity: 0,
      storageUnitsPerItem: ratio,
    });

    const tier = pickTier(bucket);
    const target = targetQuantityFor(tier);
    const { movements, finalQuantity } = genMovements(`mv_syn_${shortCode}_${seq}`, tier, target, recorderIds);
    quantityByItemId.set(itemId, finalQuantity);
    for (const m of movements) {
      allMovements.push({
        id: m.id,
        organizationId: warehouse.organizationId,
        warehouseId,
        inventoryItemId: itemId,
        type: m.type,
        quantity: m.quantity,
        note: m.note,
        createdById: m.createdById,
        occurredAt: new Date(now - m.dayOffset * DAY + randInt(0, 23) * HOUR),
      });
    }
  }

  for (const batch of chunk(items, ITEM_CHUNK)) {
    await prisma.inventoryItem.createMany({ data: batch });
  }
  for (const batch of chunk(allMovements, MOVEMENT_CHUNK)) {
    await prisma.stockMovement.createMany({ data: batch });
  }

  const quantityEntries = [...quantityByItemId.entries()];
  for (const batch of chunk(quantityEntries, QUANTITY_UPDATE_CHUNK)) {
    await prisma.$executeRaw`
      UPDATE inventory_items AS ii
      SET quantity = data.qty
      FROM (VALUES ${Prisma.join(batch.map(([id, qty]) => Prisma.sql`(${id}::text, ${qty}::int)`))}) AS data(id, qty)
      WHERE ii.id = data.id
    `;
  }

  return { items: items.length, movements: allMovements.length };
}

async function main() {
  console.log(`Generating synthetic scale data (window: last ${WINDOW_DAYS} days)…`);

  let totalItems = 0;
  let totalMovements = 0;
  for (const [warehouseId, { shortCode, itemCount }] of Object.entries(WAREHOUSE_TARGETS)) {
    const result = await seedWarehouse(warehouseId, shortCode, itemCount);
    totalItems += result.items;
    totalMovements += result.movements;
    console.log(`  ${warehouseId}: ${result.items} items, ${result.movements} movements`);
  }

  console.log(
    `\nDone: ${totalItems} synthetic inventory items + ${totalMovements} synthetic stock movements ` +
      `= ${totalItems + totalMovements} rows.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
