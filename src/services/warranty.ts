import { asSdkResult, getRdb, throwIfError } from './cloudbase'
import { AppError, isRecord } from '@/utils/error'
import type { WarrantyDoc } from '@/types/maintenance'

const WARRANTIES = 'warranties'

interface WarrantyRow {
  id: string
  device_id: string
  user_id: string | null
  start_date: string | null
  end_date: string
  provider: string | null
  scope: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

function toWarrantyDoc(row: WarrantyRow): WarrantyDoc {
  return {
    id: row.id,
    deviceId: row.device_id,
    userId: row.user_id,
    startDate: row.start_date ?? null,
    endDate: row.end_date,
    provider: row.provider ?? null,
    scope: row.scope ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseRows(raw: unknown): WarrantyRow[] {
  if (!Array.isArray(raw)) {
    throw new AppError('INTERNAL_ERROR', '保修数据格式错误')
  }
  return raw.filter(
    (row): row is WarrantyRow =>
      isRecord(row) && typeof row.id === 'string' && typeof row.device_id === 'string',
  )
}

/** 某设备的保修（一设备一保修）；未填写返回 null */
export async function getWarranty(deviceId: string): Promise<WarrantyDoc | null> {
  const rdb = getRdb()
  const result = asSdkResult<unknown>(
    await rdb.from(WARRANTIES).select('*').eq('device_id', deviceId).limit(1),
  )
  throwIfError(result.error, '读取保修信息失败')
  const rows = parseRows(result.data)
  return rows[0] ? toWarrantyDoc(rows[0]) : null
}

/** 本人全部保修（首页临期看板用，RLS 限定本人） */
export async function listWarranties(limit = 100): Promise<WarrantyDoc[]> {
  const rdb = getRdb()
  const result = asSdkResult<unknown>(
    await rdb.from(WARRANTIES).select('*').order('end_date', { ascending: true }).limit(limit),
  )
  throwIfError(result.error, '读取保修信息失败')
  return parseRows(result.data).map(toWarrantyDoc)
}
