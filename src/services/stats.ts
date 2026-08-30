/**
 * 统计业务操作契约（docs/API.md 第 10 节 statistics.overview）。
 *
 * 当前阶段只建立契约，不实现业务：
 * 统计由云函数执行并统一绑定当前 userId，维护金额、时间范围与软删除口径（ROADMAP Phase 8）。
 */

export interface StatisticsOverviewParams {
  /** YYYY-MM-DD，用户本地日期 */
  startDate: string
  endDate: string
  categoryId?: string
}

export interface CategoryDistributionItem {
  categoryId: string
  categoryName: string
  deviceCount: number
  assetCents: number
}

export interface StatisticsOverview {
  deviceCount: number
  activeDeviceCount: number
  totalAssetCents: number
  purchaseSpendCents: number
  maintenanceSpendCents: number
  warrantySummary: {
    inWarranty: number
    expiringIn30Days: number
    expired: number
    unknown: number
  }
  categoryDistribution: CategoryDistributionItem[]
}

export type GetStatisticsOverview = (
  params: StatisticsOverviewParams,
) => Promise<StatisticsOverview>
