/**
 * 设备与维护记录类型（docs/DATABASE.md 4.3 / 4.5，docs/API.md 第 7-8 节）。
 * Phase 1 仅用于数据库与权限验证，不做完整业务。
 */

/** 设备状态（不落库映射，直接存储枚举值） */
export type DeviceStatus = 'IN_USE' | 'IDLE' | 'SOLD' | 'DISCARDED'

/** 保修状态：不落库，按当前日期计算（docs/DATABASE.md 4.4） */
export type WarrantyStatus = 'IN_WARRANTY' | 'EXPIRING' | 'EXPIRED' | 'UNKNOWN'

/** 维护记录类型 */
export type MaintenanceType = 'REPAIR' | 'UPGRADE' | 'CLEAN' | 'REPLACE' | 'INSPECT' | 'OTHER'

/** devices 集合文档（Phase 1 验证使用最小字段集） */
export interface DeviceDoc {
  _id: string
  /** 系统写入的调用者身份，客户端禁止手动设置 */
  _openid?: string
  /** GearFlow 用户 ID：Phase 1 客户端写入时恒为 null，Phase 4 起由云函数写入 */
  userId: string | null
  name: string
  status: DeviceStatus
  brand?: string | null
  model?: string | null
  /** YYYY-MM-DD */
  purchaseDate?: string | null
  /** 单位：分 */
  purchasePriceCents?: number | null
  createdAt: string
  updatedAt: string
}

/** 维护记录业务模型（Phase 1 仅作为契约类型） */
export interface MaintenanceRecord {
  id: string
  deviceId: string
  userId: string
  title: string
  type: MaintenanceType
  /** YYYY-MM-DD */
  occurredAt: string
  /** 单位：分 */
  costCents: number | null
  vendor: string | null
  notes: string | null
}

/** 设备列表摘要（docs/API.md 7.1，Phase 4 起使用） */
export interface DeviceSummary {
  id: string
  name: string
  brand: string | null
  model: string | null
  status: DeviceStatus
  purchaseDate: string | null
  purchasePriceCents: number | null
  warranty: {
    endDate: string | null
    remainingDays: number | null
    status: WarrantyStatus
  } | null
}
