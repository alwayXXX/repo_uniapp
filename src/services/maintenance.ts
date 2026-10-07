import { callGearFlowApi } from './cloudbase'
import { ensureSession } from './auth'
import { AppError, isRecord } from '@/utils/error'
import type { MaintenanceDoc } from '@/types/maintenance'
import type { MaintenanceFormValues } from '@/validators/maintenance'
import type { ListMaintenanceParams, ListMaintenanceResult } from '@/types/api/maintenance'
import { assertClientRevision, clientRevision } from './client-state'

function expectMaintenance(value: unknown): MaintenanceDoc {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.deviceId !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.occurredAt !== 'string'
  ) {
    throw new AppError('INTERNAL_ERROR', '维护记录数据格式错误')
  }
  return value as unknown as MaintenanceDoc
}

function parseMaintenanceOrNull(value: unknown): MaintenanceDoc | null {
  if (value === null || value === undefined) return null
  return expectMaintenance(value)
}

export async function listMaintenancePage(
  params: ListMaintenanceParams,
): Promise<ListMaintenanceResult> {
  if (
    !Number.isInteger(params.page) ||
    params.page < 1 ||
    !Number.isInteger(params.pageSize) ||
    params.pageSize < 1 ||
    params.pageSize > 50
  ) {
    throw new AppError('VALIDATION_ERROR', '分页参数无效')
  }
  await ensureSession()
  const data = await callGearFlowApi<{
    items: unknown[]
    page: number
    pageSize: number
    total: number
    hasMore: boolean
  }>('maintenance.page', params as unknown as Record<string, unknown>)
  return {
    items: data.items.map(expectMaintenance),
    page: Number(data.page) || params.page,
    pageSize: Number(data.pageSize) || params.pageSize,
    total: Number(data.total) || 0,
    hasMore: data.hasMore === true,
  }
}

/** Read every bounded page before exposing a total or exporting the result. */
export async function listAllByDevice(deviceId: string): Promise<MaintenanceDoc[]> {
  const revision = clientRevision()
  const records: MaintenanceDoc[] = []
  const known = new Set<string>()
  let total: number | undefined
  for (let page = 1; ; page += 1) {
    assertClientRevision(revision)
    const result = await listMaintenancePage({ deviceId, page, pageSize: 50 })
    assertClientRevision(revision)
    if (total !== undefined && result.total !== total) {
      throw new AppError('INTERNAL_ERROR', '维护记录已变化，请刷新后重试')
    }
    total = result.total
    for (const record of result.items) {
      if (known.has(record.id)) throw new AppError('INTERNAL_ERROR', '维护记录已变化，请刷新后重试')
      known.add(record.id)
      records.push(record)
    }
    if (!result.hasMore) {
      if (records.length !== total) throw new AppError('INTERNAL_ERROR', '维护记录不完整，请重试')
      return records
    }
    if (result.items.length === 0) throw new AppError('INTERNAL_ERROR', '维护记录不完整，请重试')
  }
}

export async function getMaintenance(deviceId: string, id: string): Promise<MaintenanceDoc | null> {
  await ensureSession()
  const data = await callGearFlowApi<{ item: unknown }>('maintenance.get', { deviceId, id })
  return parseMaintenanceOrNull(data.item)
}

/** 首页「最近维护」：本人全部维护记录按日期倒序取前 N 条。 */
export async function listRecent(limit = 5): Promise<MaintenanceDoc[]> {
  await ensureSession()
  const data = await callGearFlowApi<{ items: unknown[] }>('maintenance.recent', { limit })
  return data.items.map(expectMaintenance)
}

function maintenancePayload(values: MaintenanceFormValues): Record<string, unknown> {
  return {
    title: values.title,
    type: values.type,
    occurredAt: values.occurredAt,
    costCents: values.costCents,
    vendor: values.vendor,
    notes: values.notes,
  }
}

export async function addMaintenance(
  deviceId: string,
  values: MaintenanceFormValues,
): Promise<string> {
  await ensureSession()
  const data = await callGearFlowApi<{ id: string }>('maintenance.add', {
    deviceId,
    ...maintenancePayload(values),
  })
  if (typeof data.id !== 'string') {
    throw new AppError('INTERNAL_ERROR', '添加维护记录返回格式错误')
  }
  return data.id
}

export async function updateMaintenance(
  recordId: string,
  values: MaintenanceFormValues,
): Promise<void> {
  await ensureSession()
  await callGearFlowApi('maintenance.update', {
    id: recordId,
    ...maintenancePayload(values),
  })
}

export async function deleteMaintenance(recordId: string): Promise<void> {
  await ensureSession()
  await callGearFlowApi('maintenance.delete', { id: recordId })
}
