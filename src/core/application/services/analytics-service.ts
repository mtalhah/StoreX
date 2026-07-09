import { ValidationError } from '@/core/domain/errors';
import { authorize, Permission } from '../auth/permissions';
import type { TenantContext } from '../auth/tenant-context';
import type {
  AnalyticsRepository,
  DashboardKpis,
  InventoryInsightRow,
  MovementTrendPoint,
  WarehouseUtilizationRow,
} from '../ports/analytics-repository';

const MAX_TREND_DAYS = 180;

export class AnalyticsService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly analytics: AnalyticsRepository,
  ) {}

  async kpis(): Promise<DashboardKpis> {
    authorize(this.ctx, Permission.AnalyticsRead);
    return this.analytics.getKpis();
  }

  async movementTrend(days: number): Promise<MovementTrendPoint[]> {
    authorize(this.ctx, Permission.AnalyticsRead);
    if (!Number.isInteger(days) || days < 1 || days > MAX_TREND_DAYS) {
      throw new ValidationError(`Trend window must be between 1 and ${MAX_TREND_DAYS} days.`);
    }
    return this.analytics.getMovementTrend(days);
  }

  async warehouseUtilization(): Promise<WarehouseUtilizationRow[]> {
    authorize(this.ctx, Permission.AnalyticsRead);
    return this.analytics.getWarehouseUtilization();
  }

  async inventoryInsights(): Promise<InventoryInsightRow[]> {
    authorize(this.ctx, Permission.AnalyticsRead);
    return this.analytics.getInventoryInsights();
  }
}
