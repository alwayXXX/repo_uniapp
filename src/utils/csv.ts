/**
 * CSV 构建工具（Phase 11 数据导出）。
 * 遵循 RFC 4180：逗号/引号/换行需转义为带引号字段；行尾 CRLF；
 * 输出默认带 UTF-8 BOM，保证 Excel 直接打开中文不乱码。
 */

/** 转义单个字段：含逗号、双引号、换行时用双引号包裹，内部双引号翻倍 */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export interface CsvColumn<T> {
  /** 表头（中文列名） */
  header: string
  /** 从行数据取值 */
  value: (row: T) => unknown
}

/** 由列定义构建 CSV 文本（含表头，行尾 CRLF，不带 BOM） */
export function buildCsv<T>(columns: Array<CsvColumn<T>>, rows: T[]): string {
  const lines: string[] = [
    columns.map((c) => escapeCsvField(c.header)).join(','),
    ...rows.map((row) => columns.map((c) => escapeCsvField(c.value(row))).join(',')),
  ]
  return lines.join('\r\n') + '\r\n'
}

/** UTF-8 BOM 前缀：Excel 打开中文必需 */
export const UTF8_BOM = '\uFEFF'

/** 构建 Excel 友好的 CSV（带 BOM） */
export function buildCsvWithBom<T>(columns: Array<CsvColumn<T>>, rows: T[]): string {
  return UTF8_BOM + buildCsv(columns, rows)
}
