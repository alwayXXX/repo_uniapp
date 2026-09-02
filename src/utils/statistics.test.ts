import { describe, expect, it } from 'vitest'
import { getStatisticsDateRange, isValidDateString, percentage } from './statistics'

describe('getStatisticsDateRange', () => {
  const now = new Date(2026, 8, 2)

  it('返回当前年度范围', () => {
    expect(getStatisticsDateRange('currentYear', now)).toEqual({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      label: '2026 年至今',
    })
  })

  it('返回上一年度范围', () => {
    expect(getStatisticsDateRange('previousYear', now)).toEqual({
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      label: '2025 年',
    })
  })

  it('全部时间结束日使用本地今天', () => {
    expect(getStatisticsDateRange('all', now)).toEqual({
      startDate: '1970-01-01',
      endDate: '2026-09-02',
      label: '全部时间',
    })
  })
})

describe('percentage', () => {
  it('计算并限制到 0-100', () => {
    expect(percentage(1, 4)).toBe(25)
    expect(percentage(9, 4)).toBe(100)
    expect(percentage(1, 0)).toBe(0)
  })
})

describe('isValidDateString', () => {
  it('拒绝不存在的日历日期', () => {
    expect(isValidDateString('2026-02-31')).toBe(false)
    expect(isValidDateString('2026-02-28')).toBe(true)
  })
})
