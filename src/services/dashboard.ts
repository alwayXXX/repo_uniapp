import { callGearFlowApi } from './cloudbase'
import { ensureSession } from './auth'
import { AppError, isRecord } from '@/utils/error'

export interface DashboardWarrantySummary {
  inWarranty: number
  expiringIn30Days: number
  expired: number
  unknown: number
}

export interface DashboardWarrantyItem {
  deviceId: string
  deviceName: string
  endDate: string
  remainingDays: number
}

export interface DashboardMaintenanceItem {
  id: string
  deviceId: string
  deviceName: string
  title: string
  occurredAt: string
  costCents: number | null
  currency: string
}

export interface HomeDashboard {
  deviceCount: number
  activeDeviceCount: number
  warrantySummary: DashboardWarrantySummary
  expiringTotal: number
  expiredTotal: number
  expiring: DashboardWarrantyItem[]
  expired: DashboardWarrantyItem[]
  recentMaintenances: DashboardMaintenanceItem[]
}

function readObject(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) throw new AppError('INTERNAL_ERROR', message)
  return value
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new AppError('INTERNAL_ERROR', `看板字段 ${field} 格式错误`)
  return value
}

function readInt(value: unknown, field: string, allowNegative = false): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^-?\d+$/.test(value)
        ? Number(value)
        : Number.NaN
  if (!Number.isSafeInteger(parsed) || (!allowNegative && parsed < 0)) {
    throw new AppError('INTERNAL_ERROR', `看板字段 ${field} 格式错误`)
  }
  return parsed
}

function parseSummary(value: unknown): DashboardWarrantySummary {
  const row = readObject(value, '看板保修统计格式错误')
  return {
    inWarranty: readInt(row.inWarranty, 'inWarranty'),
    expiringIn30Days: readInt(row.expiringIn30Days, 'expiringIn30Days'),
    expired: readInt(row.expired, 'expired'),
    unknown: readInt(row.unknown, 'unknown'),
  }
}

function parseWarrantyItems(value: unknown): DashboardWarrantyItem[] {
  if (!Array.isArray(value)) throw new AppError('INTERNAL_ERROR', '看板保修列表格式错误')
  return value.map((item) => {
    const row = readObject(item, '看板保修项格式错误')
    return {
      deviceId: readString(row.deviceId, 'deviceId'),
      deviceName: readString(row.deviceName, 'deviceName'),
      endDate: readString(row.endDate, 'endDate'),
      remainingDays: readInt(row.remainingDays, 'remainingDays', true),
    }
  })
}

function parseMaintenanceItems(value: unknown): DashboardMaintenanceItem[] {
  if (!Array.isArray(value)) throw new AppError('INTERNAL_ERROR', '看板维护列表格式错误')
  return value.map((item) => {
    const row = readObject(item, '看板维护项格式错误')
    const cost = row.costCents === null ? null : readInt(row.costCents, 'costCents')
    return {
      id: readString(row.id, 'id'),
      deviceId: readString(row.deviceId, 'deviceId'),
      deviceName: readString(row.deviceName, 'deviceName'),
      title: readString(row.title, 'title'),
      occurredAt: readString(row.occurredAt, 'occurredAt'),
      costCents: cost,
      currency: readString(row.currency, 'currency'),
    }
  })
}

function parseDashboard(value: unknown): HomeDashboard {
  const row = readObject(value, '首页看板数据格式错误')
  return {
    deviceCount: readInt(row.deviceCount, 'deviceCount'),
    activeDeviceCount: readInt(row.activeDeviceCount, 'activeDeviceCount'),
    warrantySummary: parseSummary(row.warrantySummary),
    expiringTotal: readInt(row.expiringTotal, 'expiringTotal'),
    expiredTotal: readInt(row.expiredTotal, 'expiredTotal'),
    expiring: parseWarrantyItems(row.expiring),
    expired: parseWarrantyItems(row.expired),
    recentMaintenances: parseMaintenanceItems(row.recentMaintenances),
  }
}

/** 首页聚合看板：不再拉取设备/保修全量列表。 */
export async function getHomeDashboard(): Promise<HomeDashboard> {
  await ensureSession()
  const data = await callGearFlowApi<unknown>('dashboard.get')
  return parseDashboard(data)
}
