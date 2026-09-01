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

export interface WarrantyInput {
  startDate: string | null
  endDate: string
  provider: string | null
}

/** 保存设备保修（一设备一行，幂等 upsert 语义：已有则更新） */
export async function saveWarranty(deviceId: string, input: WarrantyInput): Promise<void> {
  const rdb = getRdb()
  const existing = await getWarranty(deviceId)
  if (existing) {
    const result = asSdkResult<unknown>(
      await rdb
        .from(WARRANTIES)
        .update({
          start_date: input.startDate,
          end_date: input.endDate,
          provider: input.provider,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id),
    )
    throwIfError(result.error, '保存保修信息失败')
    return
  }
  const result = asSdkResult<unknown>(
    await rdb
      .from(WARRANTIES)
      .insert({
        device_id: deviceId,
        start_date: input.startDate,
        end_date: input.endDate,
        provider: input.provider,
      })
      .select(),
  )
  throwIfError(result.error, '保存保修信息失败')
}

/** 清除设备保修（表单日期被清空时调用） */
export async function removeWarranty(deviceId: string): Promise<void> {
  const existing = await getWarranty(deviceId)
  if (!existing) return
  const rdb = getRdb()
  const result = asSdkResult<unknown>(await rdb.from(WARRANTIES).delete().eq('id', existing.id))
  throwIfError(result.error, '清除保修信息失败')
}
