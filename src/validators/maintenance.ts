/**
 * 维护记录表单校验（docs/PRD 4.4 异常态 + docs/API.md 8.2）。
 * 纯函数、无框架依赖；设备购买日期作为上下文传入做日期边界校验。
 */
import { MAINTENANCE_TYPE_OPTIONS } from '@/constants/maintenance'
import type { MaintenanceFormInput } from '@/types/maintenance'
import type { MaintenanceType } from '@/types/device'
import { yuanToCents } from '@/utils/money'

export interface MaintenanceFormErrors {
  title?: string
  type?: string
  occurredAt?: string
  cost?: string
  notes?: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function todayString(): string {
  const now = new Date()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}

function isValidType(value: string): value is MaintenanceType {
  return MAINTENANCE_TYPE_OPTIONS.some((option) => option.value === value)
}

export function validateMaintenanceForm(
  form: MaintenanceFormInput,
  devicePurchaseDate?: string | null,
): MaintenanceFormErrors {
  const errors: MaintenanceFormErrors = {}

  const title = form.title.trim()
  if (!title) {
    errors.title = '标题不能为空'
  } else if (title.length > 64) {
    errors.title = '标题不能超过 64 个字符'
  }

  if (!isValidType(form.type)) {
    errors.type = '维护类型无效'
  }

  if (!DATE_RE.test(form.occurredAt)) {
    errors.occurredAt = '日期格式应为 YYYY-MM-DD'
  } else {
    const today = todayString()
    if (form.occurredAt > today) {
      errors.occurredAt = '发生日期不能晚于今天'
    } else if (
      devicePurchaseDate &&
      DATE_RE.test(devicePurchaseDate) &&
      form.occurredAt < devicePurchaseDate
    ) {
      errors.occurredAt = '发生日期不能早于设备购买日期'
    }
  }

  if (form.costYuan.trim() !== '') {
    const cents = yuanToCents(form.costYuan)
    if (cents === null) {
      errors.cost = '费用格式错误（最多两位小数，不能为负）'
    }
  }

  return errors
}

export interface MaintenanceFormValues {
  title: string
  type: MaintenanceType
  occurredAt: string
  costCents: number | null
  vendor: string | null
  notes: string | null
}

export interface NormalizedMaintenanceForm {
  /** 校验失败时为 null，以 errors 为准 */
  values: MaintenanceFormValues | null
  errors: MaintenanceFormErrors
}

export function normalizeMaintenanceForm(
  form: MaintenanceFormInput,
  devicePurchaseDate?: string | null,
): NormalizedMaintenanceForm {
  const errors = validateMaintenanceForm(form, devicePurchaseDate)
  if (Object.keys(errors).length > 0) {
    return { values: null, errors }
  }
  const clean = (value: string): string | null => {
    const t = value.trim()
    return t === '' ? null : t
  }
  return {
    values: {
      title: form.title.trim(),
      type: form.type,
      occurredAt: form.occurredAt,
      costCents: form.costYuan.trim() === '' ? null : yuanToCents(form.costYuan),
      vendor: clean(form.vendor),
      notes: clean(form.notes),
    },
    errors: {},
  }
}
