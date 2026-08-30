import { describe, expect, it } from 'vitest'
import { centsToYuan, yuanToCents } from './money'

describe('yuanToCents', () => {
  it('常规金额', () => {
    expect(yuanToCents('9999.00')).toBe(999900)
    expect(yuanToCents('0.01')).toBe(1)
    expect(yuanToCents('123')).toBe(12300)
    expect(yuanToCents('88.5')).toBe(8850)
  })

  it('容忍首尾空白', () => {
    expect(yuanToCents('  88.5 ')).toBe(8850)
  })

  it('空串返回 null（表示未填写）', () => {
    expect(yuanToCents('')).toBeNull()
    expect(yuanToCents('   ')).toBeNull()
  })

  it('拒绝非法输入', () => {
    expect(yuanToCents('-5')).toBeNull()
    expect(yuanToCents('1.234')).toBeNull()
    expect(yuanToCents('abc')).toBeNull()
    expect(yuanToCents('1,000')).toBeNull()
    expect(yuanToCents('123456789012')).toBeNull()
  })
})

describe('centsToYuan', () => {
  it('分转元保留两位小数', () => {
    expect(centsToYuan(999900)).toBe('9999.00')
    expect(centsToYuan(1)).toBe('0.01')
    expect(centsToYuan(0)).toBe('0.00')
  })

  it('空值返回空串', () => {
    expect(centsToYuan(null)).toBe('')
    expect(centsToYuan(undefined)).toBe('')
  })
})
