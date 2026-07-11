/**
 * Read-only analytics port (OLAP). The production implementation reads from
 * BigQuery — never from the transactional database. Implementations must
 * apply the TenantContext scope (organization + accessible warehouses) to
 * every query.
 */

export interface DashboardKpis {
  /**
   * Storage units currently on hand: sum(quantity * storageUnitsPerItem)
   * across accessible warehouses — not a raw item count. A pallet and a
   * needle both count as "1 unit" under a raw count, which would make this
   * KPI meaningless as a space measure; weighting by storageUnitsPerItem is
   * what keeps it consistent with `utilizationPct` and warehouse capacity.
   */
  totalStockUnits: number;
  activeSkus: number;
  /**
   * Storage units moved in/out over the trailing 30 days:
   * sum(movement.quantity * item.storageUnitsPerItem), not a raw quantity
   * sum — same rationale as totalStockUnits.
   */
  inbound30d: number;
  outbound30d: number;
  /** Average number of movement events per day over the trailing 30 days (a count, not a quantity). */
  movementVelocity30d: number;
  /**
   * Storage capacity used vs. total capacity across accessible warehouses
   * (sum(quantity * storageUnitsPerItem) / sum(capacity)) — not a raw
   * unit-count ratio.
   */
  utilizationPct: number;
  lowStockCount: number;
}

export interface MovementTrendPoint {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /**
   * Storage units moved in/out that day: sum(movement.quantity *
   * item.storageUnitsPerItem), not a raw quantity — the daily breakdown of
   * the same measure as DashboardKpis.inbound30d/outbound30d.
   */
  inbound: number;
  outbound: number;
}

export interface WarehouseUtilizationRow {
  warehouseId: string;
  warehouseName: string;
  capacity: number;
  /** Storage units consumed: sum(quantity * storageUnitsPerItem), not a raw item count. */
  usedCapacity: number;
  utilizationPct: number;
  skuCount: number;
}

export type StockStatus = 'LOW_STOCK' | 'DEAD_STOCK' | 'FAST_MOVER' | 'HEALTHY';

export interface InventoryInsightRow {
  warehouseId: string;
  warehouseName: string;
  sku: string;
  itemName: string;
  quantity: number;
  inbound30d: number;
  outbound30d: number;
  lastMovementAt: string | null;
  status: StockStatus;
}

export interface AnalyticsRepository {
  getKpis(): Promise<DashboardKpis>;
  getMovementTrend(days: number): Promise<MovementTrendPoint[]>;
  getWarehouseUtilization(): Promise<WarehouseUtilizationRow[]>;
  getInventoryInsights(): Promise<InventoryInsightRow[]>;
}
