/**
 * 设备表单校验（docs/API.md 7.3 校验规则）。
 * 纯函数、无框架依赖，可单元测试（AGENTS.md 测试策略）。
 */
import type { DeviceFormInput } from '@/types/device'
import { yuanToCents } from '@/utils/money'

export interface DeviceFormErrors {
  categoryId?: string
  name?: string
  purchaseDate?: string
  purchasePrice?: string
  serialNumber?: string
  notes?: string
  /** 保修日期成对性/先后校验错误 */
  warrantyDates?: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** 本地时区的今天（YYYY-MM-DD） */
export function todayString(): string {
  const now = new Date()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}

export function validateDeviceForm(form: DeviceFormInput): DeviceFormErrors {
  const errors: DeviceFormErrors = {}

  if (!form.categoryId) {
    errors.categoryId = '请选择设备分类'
  }

  const name = form.name.trim()
  if (!name) {
    errors.name = '设备名称不能为空'
  } else if (name.length > 64) {
    errors.name = '设备名称不能超过 64 个字符'
  }

  if (form.purchaseDate) {
    if (!DATE_RE.test(form.purchaseDate)) {
      errors.purchaseDate = '日期格式应为 YYYY-MM-DD'
    } else if (form.purchaseDate > todayString()) {
      errors.purchaseDate = '购买日期不能晚于今天'
    }
  }

  if (form.purchasePriceYuan.trim() !== '') {
    const cents = yuanToCents(form.purchasePriceYuan)
    if (cents === null) {
      errors.purchasePrice = '价格格式错误（最多两位小数，不能为负）'
    } else if (cents > 9999999999) {
      errors.purchasePrice = '价格超出范围'
    }
  }

  if (form.serialNumber.trim().length > 128) {
    errors.serialNumber = '序列号不能超过 128 个字符'
  }

  if (form.notes.trim().length > 1000) {
    errors.notes = '备注不能超过 1000 个字符'
  }

  return errors
}

export interface DeviceFormValues {
  categoryId: string
  name: string
  status: DeviceFormInput['status']
  brand: string | null
  model: string | null
  serialNumber: string | null
  purchaseDate: string | null
  purchaseChannel: string | null
  purchasePriceCents: number | null
  notes: string | null
}

export interface NormalizedDeviceForm {
  /** 校验失败时为 null，以 errors 为准 */
  values: DeviceFormValues | null
  errors: DeviceFormErrors
}

/** 表单 → 创建/更新输入：裁剪空白、空串转 null、金额转换成分 */
export function normalizeDeviceForm(form: DeviceFormInput): NormalizedDeviceForm {
  const errors = validateDeviceForm(form)
  if (Object.keys(errors).length > 0) {
    return { values: null, errors }
  }
  const priceCents =
    form.purchasePriceYuan.trim() === '' ? null : yuanToCents(form.purchasePriceYuan)
  const clean = (value: string): string | null => {
    const t = value.trim()
    return t === '' ? null : t
  }
  return {
    values: {
      categoryId: form.categoryId,
      name: form.name.trim(),
      status: form.status,
      brand: clean(form.brand),
      model: clean(form.model),
      serialNumber: clean(form.serialNumber),
      purchaseDate: form.purchaseDate === '' ? null : form.purchaseDate,
      purchaseChannel: clean(form.purchaseChannel),
      purchasePriceCents: priceCents,
      notes: clean(form.notes),
    },
    errors: {},
  }
}
