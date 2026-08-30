import { describe, expect, it } from 'vitest'
import { normalizeDeviceForm, todayString, validateDeviceForm } from './device'
import type { DeviceFormInput } from '@/types/device'

function validForm(): DeviceFormInput {
  return {
    categoryId: 'cat-1',
    name: 'MacBook Pro',
    status: 'IN_USE',
    brand: 'Apple',
    model: 'M3 Pro',
    serialNumber: 'C02X123',
    purchaseDate: '2026-01-01',
    purchaseChannel: 'Apple Store',
    purchasePriceYuan: '19999.00',
    notes: '主力机',
  }
}

describe('validateDeviceForm', () => {
  it('合法表单无错误', () => {
    expect(validateDeviceForm(validForm())).toEqual({})
  })

  it('分类与名称必填', () => {
    const errors = validateDeviceForm({ ...validForm(), categoryId: '', name: '   ' })
    expect(errors.categoryId).toBeTruthy()
    expect(errors.name).toBeTruthy()
  })

  it('名称超长拒绝', () => {
    const errors = validateDeviceForm({ ...validForm(), name: 'a'.repeat(65) })
    expect(errors.name).toBeTruthy()
  })

  it('购买日期不能晚于今天', () => {
    const future = '2999-12-31'
    const errors = validateDeviceForm({ ...validForm(), purchaseDate: future })
    expect(errors.purchaseDate).toBeTruthy()
  })

  it('购买日期格式非法', () => {
    const errors = validateDeviceForm({ ...validForm(), purchaseDate: '2026/01/01' })
    expect(errors.purchaseDate).toBeTruthy()
  })

  it('价格非法与合法', () => {
    expect(
      validateDeviceForm({ ...validForm(), purchasePriceYuan: '1.234' }).purchasePrice,
    ).toBeTruthy()
    expect(
      validateDeviceForm({ ...validForm(), purchasePriceYuan: '-1' }).purchasePrice,
    ).toBeTruthy()
    expect(
      validateDeviceForm({ ...validForm(), purchasePriceYuan: '' }).purchasePrice,
    ).toBeUndefined()
  })

  it('序列号与备注超长拒绝', () => {
    expect(
      validateDeviceForm({ ...validForm(), serialNumber: 's'.repeat(129) }).serialNumber,
    ).toBeTruthy()
    expect(validateDeviceForm({ ...validForm(), notes: 'n'.repeat(1001) }).notes).toBeTruthy()
  })
})

describe('normalizeDeviceForm', () => {
  it('合法表单产出规范化值：裁剪、空转 null、金额转分', () => {
    const { values, errors } = normalizeDeviceForm({
      ...validForm(),
      name: '  MacBook Pro  ',
      brand: '  ',
      purchasePriceYuan: '19999.00',
    })
    expect(errors).toEqual({})
    expect(values?.name).toBe('MacBook Pro')
    expect(values?.brand).toBeNull()
    expect(values?.purchasePriceCents).toBe(1999900)
    expect(values?.purchaseDate).toBe('2026-01-01')
  })

  it('非法表单返回 null 值与错误', () => {
    const { values, errors } = normalizeDeviceForm({ ...validForm(), name: '' })
    expect(values).toBeNull()
    expect(errors.name).toBeTruthy()
  })
})

describe('todayString', () => {
  it('返回本地今天 YYYY-MM-DD', () => {
    expect(todayString()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
