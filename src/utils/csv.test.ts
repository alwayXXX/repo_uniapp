import { describe, expect, it } from 'vitest'
import { buildCsv, buildCsvWithBom, escapeCsvField, UTF8_BOM } from './csv'
import type { CsvColumn } from './csv'

interface Row {
  name: string
  price: number | null
  note: string | null
}

const columns: Array<CsvColumn<Row>> = [
  { header: '名称', value: (r) => r.name },
  { header: '价格', value: (r) => r.price },
  { header: '备注', value: (r) => r.note },
]

describe('escapeCsvField', () => {
  it('普通文本原样输出', () => {
    expect(escapeCsvField('MacBook Pro')).toBe('MacBook Pro')
  })

  it('null 与 undefined 输出空串', () => {
    expect(escapeCsvField(null)).toBe('')
    expect(escapeCsvField(undefined)).toBe('')
  })

  it('数字转字符串', () => {
    expect(escapeCsvField(123)).toBe('123')
    expect(escapeCsvField(0)).toBe('0')
  })

  it('含逗号的字段加引号包裹', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"')
  })

  it('含双引号的字段加引号且内部引号翻倍', () => {
    expect(escapeCsvField('他说"你好"')).toBe('"他说""你好"""')
  })

  it('含换行的字段加引号包裹', () => {
    expect(escapeCsvField('第一行\n第二行')).toBe('"第一行\n第二行"')
    expect(escapeCsvField('第一行\r\n第二行')).toBe('"第一行\r\n第二行"')
  })

  it('同时含逗号和引号时完整转义', () => {
    expect(escapeCsvField('a,"b",c')).toBe('"a,""b"",c"')
  })
})

describe('buildCsv', () => {
  it('首行为表头，行尾 CRLF', () => {
    const csv = buildCsv(columns, [{ name: 'acer', price: 99900, note: null }])
    expect(csv).toBe('名称,价格,备注\r\nacer,99900,\r\n')
  })

  it('多行数据按序输出', () => {
    const csv = buildCsv(columns, [
      { name: 'a', price: 1, note: null },
      { name: 'b', price: 2, note: 'x' },
    ])
    expect(csv).toBe('名称,价格,备注\r\na,1,\r\nb,2,x\r\n')
  })

  it('空数据仅输出表头', () => {
    expect(buildCsv(columns, [])).toBe('名称,价格,备注\r\n')
  })

  it('特殊字符字段正确转义', () => {
    const csv = buildCsv(columns, [{ name: 'x,y', price: null, note: '含"引号"' }])
    expect(csv).toBe('名称,价格,备注\r\n"x,y",,"含""引号"""\r\n')
  })
})

describe('buildCsvWithBom', () => {
  it('以 UTF-8 BOM 开头', () => {
    const csv = buildCsvWithBom(columns, [])
    expect(csv.startsWith(UTF8_BOM)).toBe(true)
    expect(csv).toBe(UTF8_BOM + '名称,价格,备注\r\n')
  })
})
