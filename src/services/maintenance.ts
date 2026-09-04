import { asSdkResult, callRpc, getRdb, throwIfError } from './cloudbase'
import { ensureSession } from './auth'
import { AppError, isRecord } from '@/utils/error'
import type { MaintenanceDoc } from '@/types/maintenance'
import type { MaintenanceFormValues } from '@/validators/maintenance'
import type { MaintenanceType } from '@/types/device'

const MAINTENANCE = 'maintenance_records'

interface MaintenanceRow {
  id: string
  device_id: string
  user_id: string | null
  title: string
  type: string
  occurred_at: string
  cost_cents: number | null
  vendor: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

const VALID_TYPES: readonly MaintenanceType[] = [
  'REPAIR',
  'UPGRADE',
  'CLEAN',
  'REPLACE',
  'INSPECT',
  'OTHER',
]

function toMaintenanceDoc(row: MaintenanceRow): MaintenanceDoc {
  return {
    id: row.id,
    deviceId: row.device_id,
    userId: row.user_id,
    title: row.title,
    type: (VALID_TYPES as readonly string[]).includes(row.type)
      ? (row.type as MaintenanceType)
      : 'OTHER',
    occurredAt: row.occurred_at,
    costCents: row.cost_cents ?? null,
    vendor: row.vendor ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseRows(raw: unknown): MaintenanceRow[] {
  if (!Array.isArray(raw)) {
    throw new AppError('INTERNAL_ERROR', '维护记录数据格式错误')
  }
  return raw.filter(
    (row): row is MaintenanceRow =>
      isRecord(row) && typeof row.id === 'string' && typeof row.title === 'string',
  )
}

/** 某设备的维护记录列表，按发生日期倒序（docs/API.md 8.1） */
export async function listByDevice(deviceId: string, limit = 50): Promise<MaintenanceDoc[]> {
  const rdb = getRdb()
  const result = asSdkResult<unknown>(
    await rdb
      .from(MAINTENANCE)
      .select('*')
      .eq('device_id', deviceId)
      .order('occurred_at', { ascending: false })
      .limit(limit),
  )
  throwIfError(result.error, '读取维护记录失败')
  return parseRows(result.data).map(toMaintenanceDoc)
}

/** 首页「最近维护」：本人全部维护记录按日期倒序取前 N 条 */
export async function listRecent(limit = 5): Promise<MaintenanceDoc[]> {
  const rdb = getRdb()
  const result = asSdkResult<unknown>(
    await rdb.from(MAINTENANCE).select('*').order('occurred_at', { ascending: false }).limit(limit),
  )
  throwIfError(result.error, '读取维护记录失败')
  return parseRows(result.data).map(toMaintenanceDoc)
}

function rpcArgs(values: MaintenanceFormValues): Record<string, unknown> {
  return {
    p_title: values.title,
    p_type: values.type,
    p_occurred_at: values.occurredAt,
    p_cost_cents: values.costCents,
    p_vendor: values.vendor,
    p_notes: values.notes,
  }
}

/**
 * 新增维护记录（docs/API.md 8.2）：SECURITY DEFINER RPC 原子完成
 * 维护行 + 成本行（device_costs，带 maintenance_id 溯源）+ 时间线 MAINTENANCE 事件。
 */
export async function addMaintenance(
  deviceId: string,
  values: MaintenanceFormValues,
): Promise<string> {
  await ensureSession()
  const args = { ...rpcArgs(values), p_device_id: deviceId }
  const result = asSdkResult<unknown>(await callRpc('gf_add_maintenance', args))
  throwIfError(result.error, '添加维护记录失败')
  const data = result.data
  if (!isRecord(data) || data.ok !== true || typeof data.id !== 'string') {
    throw new AppError('FORBIDDEN', '无法对该设备添加维护记录')
  }
  return data.id
}

/** 更新维护记录（docs/API.md 8.3），成本行由 RPC 同步 */
export async function updateMaintenance(
  recordId: string,
  values: MaintenanceFormValues,
): Promise<void> {
  await ensureSession()
  const args = { ...rpcArgs(values), p_id: recordId }
  const result = asSdkResult<unknown>(await callRpc('gf_update_maintenance', args))
  throwIfError(result.error, '更新维护记录失败')
  const data = result.data
  if (!isRecord(data) || data.ok !== true) {
    throw new AppError('RESOURCE_NOT_FOUND', '维护记录不存在')
  }
}

/** 删除维护记录（docs/API.md 8.4），成本行由 RPC 同步删除 */
export async function deleteMaintenance(recordId: string): Promise<void> {
  await ensureSession()
  const result = asSdkResult<unknown>(await callRpc('gf_delete_maintenance', { p_id: recordId }))
  throwIfError(result.error, '删除维护记录失败')
  const data = result.data
  if (!isRecord(data) || data.ok !== true) {
    throw new AppError('RESOURCE_NOT_FOUND', '维护记录不存在')
  }
}
