/**
 * 维护记录类型（docs/DATABASE.md 9.6，docs/API.md 第 8 节）。
 */

/** devices 表业务模型对应的维护记录行 */
export interface MaintenanceDoc {
  id: string
  deviceId: string
  userId: string | null
  title: string
  type: import('./device').MaintenanceType
  /** YYYY-MM-DD */
  occurredAt: string
  /** 单位：分；未记录费用为 null */
  costCents: number | null
  vendor: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

/** 维护记录表单输入（金额为元字符串，由校验器转换成分） */
export interface MaintenanceFormInput {
  title: string
  type: import('./device').MaintenanceType
  /** YYYY-MM-DD，默认今天 */
  occurredAt: string
  /** '' 或最多两位小数的金额字符串 */
  costYuan: string
  vendor: string
  notes: string
}

/** warranties 表业务模型 */
export interface WarrantyDoc {
  id: string
  deviceId: string
  userId: string | null
  /** YYYY-MM-DD 或 null（开始日期可空） */
  startDate: string | null
  /** YYYY-MM-DD */
  endDate: string
  provider: string | null
  scope: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}
