/**
 * Operational-insight thresholds, shared by every AnalyticsRepository
 * implementation (they are injected into the SQL as query parameters, so
 * BigQuery and the Postgres dev fallback classify identically).
 */
export const ANALYTICS_THRESHOLDS = {
  /** At or below this quantity an item is flagged LOW_STOCK. */
  lowStockQty: 25,
  /** No movement for this many days flags DEAD_STOCK. */
  deadStockDays: 30,
  /** Outbound units in the trailing 30 days at/above this flags FAST_MOVER. */
  fastMoverOutbound30d: 400,
} as const;
