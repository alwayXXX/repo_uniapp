import type { MaintenanceRecord, MaintenanceType } from '@/types/device'

/**
 * 维护记录业务操作契约（docs/API.md 第 8 节 maintenance.*）。
 *
 * 当前阶段只建立契约，不实现业务：
 * 维护记录写操作必须由云函数执行并同步时间线与成本表（ROADMAP Phase 7）。
 */

export interface CreateMaintenanceInput {
  deviceId: string
  title: string
  type: MaintenanceType
  /** YYYY-MM-DD */
  occurredAt: string
  /** 单位：分 */
  costCents?: number
  vendor?: string
  notes?: string
}

export type ListMaintenanceRecords = (deviceId: string) => Promise<MaintenanceRecord[]>

export type CreateMaintenanceRecord = (input: CreateMaintenanceInput) => Promise<MaintenanceRecord>

export type DeleteMaintenanceRecord = (recordId: string) => Promise<void>
