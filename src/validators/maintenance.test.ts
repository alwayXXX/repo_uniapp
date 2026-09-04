import { describe, expect, it } from 'vitest'
import { normalizeMaintenanceForm, validateMaintenanceForm } from './maintenance'
import type { MaintenanceFormInput } from '@/types/maintenance'

const PURCHASE_DATE = '2026-01-01'

function validForm(): MaintenanceFormInput {
  return {
    title: '更换电池',
    type: 'REPLACE',
    occurredAt: '2026-02-01',
    costYuan: '500.00',
    vendor: '官方售后',
    notes: '电池健康度 79%',
  }
}

describe('validateMaintenanceForm', () => {
  it('合法表单无错误', () => {
    expect(validateMaintenanceForm(validForm(), PURCHASE_DATE)).toEqual({})
  })

  it('标题必填且限长', () => {
    expect(validateMaintenanceForm({ ...validForm(), title: '' }).title).toBeTruthy()
    expect(validateMaintenanceForm({ ...validForm(), title: 'a'.repeat(65) }).title).toBeTruthy()
  })

  it('日期晚于今天拒绝', () => {
    const errors = validateMaintenanceForm(
      { ...validForm(), occurredAt: '2999-01-01' },
      PURCHASE_DATE,
    )
    expect(errors.occurredAt).toBeTruthy()
  })

  it('日期早于设备购买日期拒绝', () => {
    const errors = validateMaintenanceForm(
      { ...validForm(), occurredAt: '2025-12-31' },
      PURCHASE_DATE,
    )
    expect(errors.occurredAt).toBeTruthy()
  })

  it('不存在的日历日期拒绝', () => {
    const errors = validateMaintenanceForm(
      { ...validForm(), occurredAt: '2026-02-31' },
      PURCHASE_DATE,
    )
    expect(errors.occurredAt).toBeTruthy()
  })

  it('设备无购买日期时跳过下限校验', () => {
    const errors = validateMaintenanceForm({ ...validForm(), occurredAt: '2025-12-31' }, null)
    expect(errors.occurredAt).toBeUndefined()
  })

  it('费用非法拒绝、空费用放行', () => {
    expect(validateMaintenanceForm({ ...validForm(), costYuan: '1.234' }).cost).toBeTruthy()
    expect(validateMaintenanceForm({ ...validForm(), costYuan: '' }).cost).toBeUndefined()
  })
})

describe('normalizeMaintenanceForm', () => {
  it('合法表单产出规范化值', () => {
    const { values, errors } = normalizeMaintenanceForm(
      { ...validForm(), title: '  更换电池  ', vendor: '  ', costYuan: '500.00' },
      PURCHASE_DATE,
    )
    expect(errors).toEqual({})
    expect(values?.title).toBe('更换电池')
    expect(values?.vendor).toBeNull()
    expect(values?.costCents).toBe(50000)
  })

  it('非法表单返回 null 值与错误', () => {
    const { values, errors } = normalizeMaintenanceForm(
      { ...validForm(), title: '' },
      PURCHASE_DATE,
    )
    expect(values).toBeNull()
    expect(errors.title).toBeTruthy()
  })
})
