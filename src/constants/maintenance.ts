import type { MaintenanceType } from '@/types/device'

/** 维护类型文案 */
export const MAINTENANCE_TYPE_LABELS: Record<MaintenanceType, string> = {
  REPAIR: '维修',
  UPGRADE: '升级',
  CLEAN: '清洁',
  REPLACE: '更换',
  INSPECT: '检测',
  OTHER: '其他',
}

/** 维护类型选择项（顺序即展示顺序） */
export const MAINTENANCE_TYPE_OPTIONS: ReadonlyArray<{ value: MaintenanceType; label: string }> = [
  { value: 'REPAIR', label: '维修' },
  { value: 'UPGRADE', label: '升级' },
  { value: 'CLEAN', label: '清洁' },
  { value: 'REPLACE', label: '更换' },
  { value: 'INSPECT', label: '检测' },
  { value: 'OTHER', label: '其他' },
]
