/**
 * Read-only analytics port (OLAP). The production implementation reads from
 * BigQuery — never from the transactional database. Implementations must
 * apply the TenantContext scope (organization + accessible warehouses) to
 * every query.
 */

export interface DashboardKpis {
  totalStockUnits: number;
  activeSkus: number;
  inbound30d: number;
  outbound30d: number;
  /** Average stock movements per day over the trailing 30 days. */
  movementVelocity30d: number;
  /** Total units on hand vs. total capacity across accessible warehouses. */
  utilizationPct: number;
  lowStockCount: number;
}

export interface MovementTrendPoint {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  inbound: number;
  outbound: number;
}

export interface WarehouseUtilizationRow {
  warehouseId: string;
  warehouseName: string;
  capacity: number;
  totalQuantity: number;
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
