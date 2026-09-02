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

/** 常用币种符号；未知币种回退展示其 ISO 代码，避免误用人民币符号。 */
const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  CNY: '¥',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  HKD: 'HK$',
  TWD: 'NT$',
  KRW: '₩',
}

export function currencySymbol(currency: string | null | undefined): string {
  const normalized = (currency ?? 'CNY').trim().toUpperCase()
  if (normalized === '' || normalized === 'MIXED') return ''
  return CURRENCY_SYMBOLS[normalized] ?? `${normalized} `
}

/** 分 → 带千分位和币种符号的展示文本；空值返回空串。 */
export function formatMoney(
  cents: number | null | undefined,
  currency: string | null | undefined = 'CNY',
): string {
  const amount = centsToYuan(cents)
  if (amount === '') return ''
  const [integer = '0', fraction = '00'] = amount.split('.')
  const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${currencySymbol(currency)}${groupedInteger}.${fraction}`
}
