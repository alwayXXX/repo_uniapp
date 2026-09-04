/** 统计页的日期范围与比例工具，保持页面不重复实现日期边界。 */

export { isValidDateString } from './date'

export type StatisticsRangePreset = 'currentYear' | 'previousYear' | 'all'

export interface StatisticsDateRange {
  startDate: string
  endDate: string
  label: string
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function localDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function getStatisticsDateRange(
  preset: StatisticsRangePreset,
  now: Date = new Date(),
): StatisticsDateRange {
  const year = now.getFullYear()
  if (preset === 'all') {
    return { startDate: '1970-01-01', endDate: localDateString(now), label: '全部时间' }
  }
  const targetYear = preset === 'previousYear' ? year - 1 : year
  return {
    startDate: `${targetYear}-01-01`,
    endDate: `${targetYear}-12-31`,
    label: preset === 'previousYear' ? `${targetYear} 年` : `${targetYear} 年至今`,
  }
}

export function percentage(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)))
}
