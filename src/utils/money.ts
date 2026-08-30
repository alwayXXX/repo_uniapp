/**
 * 金额工具：金额统一使用整数分存储（docs/DATABASE.md 设计原则 2），
 * 表单层使用元的字符串输入，转换与校验收敛在此处。
 */

/** 元字符串 → 分；非法输入（负数、超两位小数、非数字、超长）返回 null */
export function yuanToCents(input: string): number | null {
  const trimmed = input.trim()
  if (trimmed === '') return null
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(trimmed)) return null
  const cents = Math.round(Number(trimmed) * 100)
  return Number.isSafeInteger(cents) ? cents : null
}

/** 分 → 元字符串（两位小数）；空值返回空串 */
export function centsToYuan(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return ''
  return (cents / 100).toFixed(2)
}
