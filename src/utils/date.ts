/** 日期工具：只接受真实存在的 YYYY-MM-DD 日历日期。 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** 判断给定年份是否为公历闰年。 */
function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

/** YYYY-MM-DD 是否为实际存在的日期。 */
export function isValidDateString(value: string): boolean {
  const match = DATE_RE.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isInteger(year) || year < 1 || month < 1 || month > 12 || day < 1) return false
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= (daysInMonth[month - 1] ?? 0)
}

/** 本地时区的今天（YYYY-MM-DD）。 */
export function todayString(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** 将已校验日期转换为 UTC 日起点，避免本地夏令时影响日差。 */
export function dateToUtcDay(value: string): number {
  if (!isValidDateString(value)) return Number.NaN
  const [year = 0, month = 0, day = 0] = value.split('-').map(Number)
  const date = new Date(0)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCFullYear(year, month - 1, day)
  return date.getTime()
}

/** 计算两个日历日期之间的整天数（to - from）。 */
export function daysBetweenDates(from: string, to: string): number | null {
  const fromDay = dateToUtcDay(from)
  const toDay = dateToUtcDay(to)
  if (!Number.isFinite(fromDay) || !Number.isFinite(toDay)) return null
  return Math.round((toDay - fromDay) / 86400000)
}
