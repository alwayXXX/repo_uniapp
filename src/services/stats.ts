import { callGearFlowApi } from './cloudbase'
import { ensureSession } from './auth'
import { AppError, isRecord } from '@/utils/error'
import { isValidDateString } from '@/utils/statistics'
import type { DeviceStatus } from '@/types/device'

/** 统计业务操作参数（docs/API.md 第 10 节）。 */
export interface StatisticsOverviewParams {
  /** YYYY-MM-DD，用户本地日期；服务端按闭区间处理 */
  startDate: string
  endDate: string
  categoryId?: string
}

export interface CategoryDistributionItem {
  categoryId: string | null
  categoryName: string
  deviceCount: number
  assetCents: number
}

export interface LifecycleDistributionItem {
  status: DeviceStatus
  label: string
  deviceCount: number
  assetCents: number
}

export interface WarrantySummary {
  inWarranty: number
  expiringIn30Days: number
  expired: number
  unknown: number
}

export interface StatisticsOverview {
  deviceCount: number
  activeDeviceCount: number
  totalAssetCents: number
  purchaseSpendCents: number
  maintenanceSpendCents: number
  currency: string
  warrantySummary: WarrantySummary
  categoryDistribution: CategoryDistributionItem[]
  lifecycleDistribution: LifecycleDistributionItem[]
}

export type GetStatisticsOverview = (
  params: StatisticsOverviewParams,
) => Promise<StatisticsOverview>

const VALID_STATUSES: readonly DeviceStatus[] = ['IN_USE', 'IDLE', 'SOLD', 'DISCARDED']

function readObject(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) throw new AppError('INTERNAL_ERROR', message)
  return value
}

function readInt(value: unknown, field: string): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^-?\d+$/.test(value)
        ? Number(value)
        : Number.NaN
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new AppError('INTERNAL_ERROR', `统计字段 ${field} 格式错误`)
  }
  return parsed
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new AppError('INTERNAL_ERROR', `统计字段 ${field} 格式错误`)
  return value
}

function parseWarrantySummary(value: unknown): WarrantySummary {
  const row = readObject(value, '保修统计数据格式错误')
  return {
    inWarranty: readInt(row.inWarranty, 'inWarranty'),
    expiringIn30Days: readInt(row.expiringIn30Days, 'expiringIn30Days'),
    expired: readInt(row.expired, 'expired'),
    unknown: readInt(row.unknown, 'unknown'),
  }
}

function parseCategoryDistribution(value: unknown): CategoryDistributionItem[] {
  if (!Array.isArray(value)) throw new AppError('INTERNAL_ERROR', '分类统计数据格式错误')
  return value.map((item) => {
    const row = readObject(item, '分类统计项格式错误')
    const categoryId = row.categoryId === null ? null : readString(row.categoryId, 'categoryId')
    return {
      categoryId,
      categoryName: readString(row.categoryName, 'categoryName'),
      deviceCount: readInt(row.deviceCount, 'deviceCount'),
      assetCents: readInt(row.assetCents, 'assetCents'),
    }
  })
}

function parseLifecycleDistribution(value: unknown): LifecycleDistributionItem[] {
  if (!Array.isArray(value)) throw new AppError('INTERNAL_ERROR', '生命周期统计数据格式错误')
  return value.map((item) => {
    const row = readObject(item, '生命周期统计项格式错误')
    const status = readString(row.status, 'status')
    if (!(VALID_STATUSES as readonly string[]).includes(status)) {
      throw new AppError('INTERNAL_ERROR', '生命周期状态格式错误')
    }
    return {
      status: status as DeviceStatus,
      label: readString(row.label, 'label'),
      deviceCount: readInt(row.deviceCount, 'deviceCount'),
      assetCents: readInt(row.assetCents, 'assetCents'),
    }
  })
}

function parseOverview(value: unknown): StatisticsOverview {
  const row = readObject(value, '统计数据格式错误')
  return {
    deviceCount: readInt(row.deviceCount, 'deviceCount'),
    activeDeviceCount: readInt(row.activeDeviceCount, 'activeDeviceCount'),
    totalAssetCents: readInt(row.totalAssetCents, 'totalAssetCents'),
    purchaseSpendCents: readInt(row.purchaseSpendCents, 'purchaseSpendCents'),
    maintenanceSpendCents: readInt(row.maintenanceSpendCents, 'maintenanceSpendCents'),
    currency: readString(row.currency, 'currency'),
    warrantySummary: parseWarrantySummary(row.warrantySummary),
    categoryDistribution: parseCategoryDistribution(row.categoryDistribution),
    lifecycleDistribution: parseLifecycleDistribution(row.lifecycleDistribution),
  }
}

function validateParams(params: StatisticsOverviewParams): void {
  if (!isValidDateString(params.startDate) || !isValidDateString(params.endDate)) {
    throw new AppError('DATE_RANGE_INVALID', '统计日期格式无效')
  }
  if (params.startDate > params.endDate) {
    throw new AppError('DATE_RANGE_INVALID', '统计开始日期不能晚于结束日期')
  }
}

/** statistics.overview：云函数按 OPENID 汇总本人数据。 */
export async function getStatisticsOverview(
  params: StatisticsOverviewParams,
): Promise<StatisticsOverview> {
  validateParams(params)
  await ensureSession()
  const data = await callGearFlowApi<unknown>('stats.overview', {
    startDate: params.startDate,
    endDate: params.endDate,
    categoryId: params.categoryId ?? null,
  })
  return parseOverview(data)
}
