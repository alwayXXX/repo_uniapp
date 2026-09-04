import { describe, expect, it } from 'vitest'
import { computeWarranty, WARRANTY_EXPIRING_DAYS } from './warranty'

// 固定"今天"做边界测试，避免测试随日期漂移
const TODAY = '2026-08-31'

describe('computeWarranty', () => {
  it('无保修结束日期 → UNKNOWN', () => {
    expect(computeWarranty(null, TODAY)).toEqual({ status: 'UNKNOWN', remainingDays: null })
    expect(computeWarranty('', TODAY)).toEqual({ status: 'UNKNOWN', remainingDays: null })
    expect(computeWarranty('2026/08/31', TODAY)).toEqual({ status: 'UNKNOWN', remainingDays: null })
  })

  it('远期保修 → IN_WARRANTY，剩余天数正确', () => {
    // 今天 2026-08-31 → 结束 2027-08-31，差 365 天
    const result = computeWarranty('2027-08-31', TODAY)
    expect(result.status).toBe('IN_WARRANTY')
    expect(result.remainingDays).toBe(365)
  })

  it(`剩余恰好 ${WARRANTY_EXPIRING_DAYS} 天 → EXPIRING（含边界）`, () => {
    const end = '2026-09-30' // 8-31 到 9-30 = 30 天
    const result = computeWarranty(end, TODAY)
    expect(result.status).toBe('EXPIRING')
    expect(result.remainingDays).toBe(30)
  })

  it('剩余 31 天 → IN_WARRANTY（边界外）', () => {
    const result = computeWarranty('2026-10-01', TODAY)
    expect(result.status).toBe('IN_WARRANTY')
    expect(result.remainingDays).toBe(31)
  })

  it('今天到期 → EXPIRING，剩余 0 天', () => {
    // 今天到期 = 结束日期等于今天，剩余 0
    const result = computeWarranty('2026-08-31', '2026-08-31')
    expect(result.status).toBe('EXPIRING')
    expect(result.remainingDays).toBe(0)
  })

  it('昨天到期 → EXPIRED，剩余 -1', () => {
    const result = computeWarranty('2026-08-30', TODAY)
    expect(result.status).toBe('EXPIRED')
    expect(result.remainingDays).toBe(-1)
  })

  it('不存在的结束日期或今天日期 → UNKNOWN', () => {
    expect(computeWarranty('2026-02-31', TODAY)).toEqual({
      status: 'UNKNOWN',
      remainingDays: null,
    })
    expect(computeWarranty('2026-09-30', '2026-02-31')).toEqual({
      status: 'UNKNOWN',
      remainingDays: null,
    })
  })
})
