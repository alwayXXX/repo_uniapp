/**
 * 设备与维护记录类型（docs/DATABASE.md 4.3 / 4.5 / 9.2，docs/API.md 第 7-8 节）。
 */

/** 设备状态 */
export type DeviceStatus = 'IN_USE' | 'IDLE' | 'SOLD' | 'DISCARDED'

/** 保修状态：不落库，按当前日期计算（docs/DATABASE.md 4.4，Phase 7 启用） */
export type WarrantyStatus = 'IN_WARRANTY' | 'EXPIRING' | 'EXPIRED' | 'UNKNOWN'

/** 维护记录类型 */
export type MaintenanceType = 'REPAIR' | 'UPGRADE' | 'CLEAN' | 'REPLACE' | 'INSPECT' | 'OTHER'

/** 设备分类（device_categories 表；MVP 仅 SYSTEM 系统分类） */
export interface DeviceCategory {
  id: string
  code: string
  name: string
  sortOrder: number
}

/** devices 表业务模型（snake_case 由服务层映射） */
export interface DeviceDoc {
  id: string
  /** 当前登录身份（云函数内部为微信 OPENID），全库一致约定 */
  userId: string | null
  categoryId: string | null
  name: string
  status: DeviceStatus
  brand: string | null
  model: string | null
  serialNumber: string | null
  /** YYYY-MM-DD */
  purchaseDate: string | null
  purchaseChannel: string | null
  /** 单位：分 */
  purchasePriceCents: number | null
  currency: string
  notes: string | null
  /** 软删除标记 */
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

/** 列表查询参数（docs/API.md 7.1） */
export interface ListDevicesParams {
  keyword?: string
  categoryId?: string
  status?: DeviceStatus
  sortBy: 'createdAt' | 'purchaseDate' | 'name' | 'price'
  sortOrder: 'asc' | 'desc'
  page: number
  pageSize: number
}

export interface ListDevicesResult {
  items: DeviceDoc[]
  total: number
  hasMore: boolean
}

/** 创建/编辑表单输入（金额为元字符串，由校验器转换成分） */
export interface DeviceFormInput {
  categoryId: string
  name: string
  status: DeviceStatus
  brand: string
  model: string
  serialNumber: string
  /** '' 或 YYYY-MM-DD */
  purchaseDate: string
  purchaseChannel: string
  /** '' 或最多两位小数的金额字符串 */
  purchasePriceYuan: string
  notes: string
}

/** 维护记录业务模型（Phase 7 启用） */
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

/** 设备列表摘要（Phase 5 详情/Phase 7 保修摘要后扩展） */
export interface DeviceSummary {
  id: string
  name: string
  status: DeviceStatus
  brand: string | null
  model: string | null
  purchaseDate: string | null
  purchasePriceCents: number | null
}
