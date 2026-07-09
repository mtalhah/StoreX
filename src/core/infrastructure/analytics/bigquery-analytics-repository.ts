import { ANALYTICS_THRESHOLDS } from '@/core/application/analytics-thresholds';
import type { TenantContext } from '@/core/application/auth/tenant-context';
import type {
  AnalyticsRepository,
  DashboardKpis,
  InventoryInsightRow,
  MovementTrendPoint,
  StockStatus,
  WarehouseUtilizationRow,
} from '@/core/application/ports/analytics-repository';
import { analyticsDataset, bigquery } from './bigquery';

/**
 * Production analytics repository. Reads exclusively from the BigQuery
 * analytics dataset (views over the Datastream-replicated raw tables — see
 * analytics/bigquery/*.sql). It never touches the transactional database.
 *
 * Tenant isolation: every query is parameterized with the organization id
 * and, for warehouse-scoped roles, the accessible warehouse ids. The scope
 * comes from the TenantContext, exactly like the OLTP repositories.
 */
export class BigQueryAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly ctx: TenantContext) {}

  private get scopeParams() {
    return {
      orgId: this.ctx.organizationId,
      scopeAll: this.ctx.accessibleWarehouseIds === null,
      warehouseIds: this.ctx.accessibleWarehouseIds ?? [],
    };
  }

  private async run<T>(query: string, params: Record<string, unknown> = {}): Promise<T[]> {
    const [rows] = await bigquery.query({
      query,
      params: { ...this.scopeParams, ...params },
      // Explicit types so empty warehouse-id arrays still bind correctly.
      types: { warehouseIds: ['STRING'] },
    });
    return rows as T[];
  }

  async getKpis(): Promise<DashboardKpis> {
    const ds = analyticsDataset();
    const [row] = await this.run<{
      totalStockUnits: number;
      activeSkus: number;
      inbound30d: number;
      outbound30d: number;
      movementVelocity30d: number;
      utilizationPct: number | null;
      lowStockCount: number;
    }>(
      `
      WITH inv AS (
        SELECT quantity
        FROM ${ds}.fact_inventory_current
        WHERE organization_id = @orgId
          AND (@scopeAll OR warehouse_id IN UNNEST(@warehouseIds))
      ),
      wh AS (
        SELECT capacity
        FROM ${ds}.dim_warehouse
        WHERE organization_id = @orgId
          AND (@scopeAll OR warehouse_id IN UNNEST(@warehouseIds))
      ),
      mv AS (
        SELECT type, quantity
        FROM ${ds}.fact_stock_movement
        WHERE organization_id = @orgId
          AND (@scopeAll OR warehouse_id IN UNNEST(@warehouseIds))
          AND occurred_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
      )
      SELECT
        (SELECT COALESCE(SUM(quantity), 0) FROM inv) AS totalStockUnits,
        (SELECT COUNT(*) FROM inv) AS activeSkus,
        (SELECT COALESCE(SUM(IF(type = 'INBOUND', quantity, 0)), 0) FROM mv) AS inbound30d,
        (SELECT COALESCE(SUM(IF(type = 'OUTBOUND', quantity, 0)), 0) FROM mv) AS outbound30d,
        (SELECT ROUND(COUNT(*) / 30, 1) FROM mv) AS movementVelocity30d,
        SAFE_DIVIDE(
          (SELECT SUM(quantity) FROM inv),
          (SELECT SUM(capacity) FROM wh)
        ) * 100 AS utilizationPct,
        (SELECT COUNT(*) FROM inv WHERE quantity <= @lowStockQty) AS lowStockCount
      `,
      { lowStockQty: ANALYTICS_THRESHOLDS.lowStockQty },
    );

    return {
      totalStockUnits: Number(row?.totalStockUnits ?? 0),
      activeSkus: Number(row?.activeSkus ?? 0),
      inbound30d: Number(row?.inbound30d ?? 0),
      outbound30d: Number(row?.outbound30d ?? 0),
      movementVelocity30d: Number(row?.movementVelocity30d ?? 0),
      utilizationPct: Number(row?.utilizationPct ?? 0),
      lowStockCount: Number(row?.lowStockCount ?? 0),
    };
  }

  async getMovementTrend(days: number): Promise<MovementTrendPoint[]> {
    const ds = analyticsDataset();
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - (days - 1));
    const startDate = start.toISOString().slice(0, 10);

    const rows = await this.run<{ date: { value: string } | string; inbound: number; outbound: number }>(
      `
      SELECT
        day AS date,
        COALESCE(SUM(IF(m.type = 'INBOUND', m.quantity, 0)), 0) AS inbound,
        COALESCE(SUM(IF(m.type = 'OUTBOUND', m.quantity, 0)), 0) AS outbound
      FROM UNNEST(GENERATE_DATE_ARRAY(@startDate, CURRENT_DATE())) AS day
      LEFT JOIN ${ds}.fact_stock_movement m
        ON DATE(m.occurred_at) = day
        AND m.organization_id = @orgId
        AND (@scopeAll OR m.warehouse_id IN UNNEST(@warehouseIds))
      GROUP BY day
      ORDER BY day
      `,
      { startDate: bigquery.date(startDate) },
    );

    return rows.map((r) => ({
      date: typeof r.date === 'string' ? r.date : r.date.value,
      inbound: Number(r.inbound),
      outbound: Number(r.outbound),
    }));
  }

  async getWarehouseUtilization(): Promise<WarehouseUtilizationRow[]> {
    const ds = analyticsDataset();
    const rows = await this.run<{
      warehouseId: string;
      warehouseName: string;
      capacity: number;
      totalQuantity: number;
      skuCount: number;
    }>(
      `
      SELECT
        w.warehouse_id AS warehouseId,
        w.name AS warehouseName,
        w.capacity AS capacity,
        COALESCE(SUM(i.quantity), 0) AS totalQuantity,
        COUNT(i.sku) AS skuCount
      FROM ${ds}.dim_warehouse w
      LEFT JOIN ${ds}.fact_inventory_current i
        ON i.warehouse_id = w.warehouse_id
      WHERE w.organization_id = @orgId
        AND (@scopeAll OR w.warehouse_id IN UNNEST(@warehouseIds))
      GROUP BY 1, 2, 3
      ORDER BY warehouseName
      `,
    );

    return rows.map((r) => ({
      warehouseId: r.warehouseId,
      warehouseName: r.warehouseName,
      capacity: Number(r.capacity),
      totalQuantity: Number(r.totalQuantity),
      skuCount: Number(r.skuCount),
      utilizationPct:
        Number(r.capacity) > 0 ? (Number(r.totalQuantity) / Number(r.capacity)) * 100 : 0,
    }));
  }

  async getInventoryInsights(): Promise<InventoryInsightRow[]> {
    const ds = analyticsDataset();
    const rows = await this.run<{
      warehouseId: string;
      warehouseName: string;
      sku: string;
      itemName: string;
      quantity: number;
      inbound30d: number;
      outbound30d: number;
      lastMovementAt: { value: string } | string | null;
      status: StockStatus;
    }>(
      `
      WITH mv30 AS (
        SELECT
          inventory_item_id,
          SUM(IF(type = 'INBOUND', quantity, 0)) AS inbound30d,
          SUM(IF(type = 'OUTBOUND', quantity, 0)) AS outbound30d
        FROM ${ds}.fact_stock_movement
        WHERE organization_id = @orgId
          AND occurred_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
        GROUP BY 1
      ),
      last_mv AS (
        SELECT inventory_item_id, MAX(occurred_at) AS last_movement_at
        FROM ${ds}.fact_stock_movement
        WHERE organization_id = @orgId
        GROUP BY 1
      )
      SELECT
        i.warehouse_id AS warehouseId,
        i.warehouse_name AS warehouseName,
        i.sku AS sku,
        i.item_name AS itemName,
        i.quantity AS quantity,
        COALESCE(m.inbound30d, 0) AS inbound30d,
        COALESCE(m.outbound30d, 0) AS outbound30d,
        FORMAT_TIMESTAMP('%FT%TZ', l.last_movement_at) AS lastMovementAt,
        CASE
          WHEN i.quantity <= @lowStockQty THEN 'LOW_STOCK'
          WHEN l.last_movement_at IS NULL
            OR l.last_movement_at < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @deadStockDays DAY)
            THEN 'DEAD_STOCK'
          WHEN COALESCE(m.outbound30d, 0) >= @fastMoverOutbound30d THEN 'FAST_MOVER'
          ELSE 'HEALTHY'
        END AS status
      FROM ${ds}.fact_inventory_current i
      LEFT JOIN mv30 m ON m.inventory_item_id = i.inventory_item_id
      LEFT JOIN last_mv l ON l.inventory_item_id = i.inventory_item_id
      WHERE i.organization_id = @orgId
        AND (@scopeAll OR i.warehouse_id IN UNNEST(@warehouseIds))
      ORDER BY i.warehouse_name, i.sku
      `,
      {
        lowStockQty: ANALYTICS_THRESHOLDS.lowStockQty,
        deadStockDays: ANALYTICS_THRESHOLDS.deadStockDays,
        fastMoverOutbound30d: ANALYTICS_THRESHOLDS.fastMoverOutbound30d,
      },
    );

    return rows.map((r) => ({
      warehouseId: r.warehouseId,
      warehouseName: r.warehouseName,
      sku: r.sku,
      itemName: r.itemName,
      quantity: Number(r.quantity),
      inbound30d: Number(r.inbound30d),
      outbound30d: Number(r.outbound30d),
      lastMovementAt:
        r.lastMovementAt == null
          ? null
          : typeof r.lastMovementAt === 'string'
            ? r.lastMovementAt
            : r.lastMovementAt.value,
      status: r.status,
    }));
  }
}
