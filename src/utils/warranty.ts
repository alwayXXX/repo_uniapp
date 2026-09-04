/**
 * 保修状态计算（docs/DATABASE.md 9.9：状态不落库，按 end_date 实时计算）。
 * 纯函数、无框架依赖，日期边界有单元测试。
 */
import type { WarrantyStatus } from '@/types/device'
import { daysBetweenDates, isValidDateString, todayString } from './date'

export interface WarrantyState {
  status: WarrantyStatus
  /** 距过期剩余天数（过期为负）；UNKNOWN 时为 null */
  remainingDays: number | null
}

/** 保修临期阈值：剩余 ≤30 天视为临期 */
export const WARRANTY_EXPIRING_DAYS = 30

/**
 * 按保修结束日期计算状态与剩余天数。
 * @param endDate 保修结束日期（YYYY-MM-DD），缺失返回 UNKNOWN
 * @param today 今天（YYYY-MM-DD），缺省取本地当前日期；测试可注入固定日期
 */
export function computeWarranty(
  endDate: string | null | undefined,
  today: string = todayString(),
): WarrantyState {
  if (!endDate || !isValidDateString(endDate) || !isValidDateString(today)) {
    return { status: 'UNKNOWN', remainingDays: null }
  }
  const remaining = daysBetweenDates(today, endDate)
  if (remaining === null) return { status: 'UNKNOWN', remainingDays: null }
  if (remaining < 0) return { status: 'EXPIRED', remainingDays: remaining }
  if (remaining <= WARRANTY_EXPIRING_DAYS) return { status: 'EXPIRING', remainingDays: remaining }
  return { status: 'IN_WARRANTY', remainingDays: remaining }
}

/** 保修状态文案 */
export const WARRANTY_STATUS_LABELS: Record<WarrantyStatus, string> = {
  IN_WARRANTY: '保修中',
  EXPIRING: '即将过期',
  EXPIRED: '已过保',
  UNKNOWN: '未填写保修',
}
