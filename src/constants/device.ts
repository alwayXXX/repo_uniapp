import type { DeviceStatus } from '@/types/device'

/** 设备状态文案 */
export const DEVICE_STATUS_LABELS: Record<DeviceStatus, string> = {
  IN_USE: '使用中',
  IDLE: '闲置',
  SOLD: '已出售',
  DISCARDED: '已报废',
}

/** 设备状态选择项（顺序即展示顺序） */
export const DEVICE_STATUS_OPTIONS: ReadonlyArray<{ value: DeviceStatus; label: string }> = [
  { value: 'IN_USE', label: '使用中' },
  { value: 'IDLE', label: '闲置' },
  { value: 'SOLD', label: '已出售' },
  { value: 'DISCARDED', label: '已报废' },
]

/** 列表排序选择项（value 编码为 sortBy:sortOrder） */
export const DEVICE_SORT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'createdAt:desc', label: '最近添加' },
  { value: 'createdAt:asc', label: '最早添加' },
  { value: 'purchaseDate:desc', label: '购买日期从新到旧' },
  { value: 'purchaseDate:asc', label: '购买日期从旧到新' },
  { value: 'price:desc', label: '价格从高到低' },
  { value: 'price:asc', label: '价格从低到高' },
  { value: 'name:asc', label: '名称 A-Z' },
]
