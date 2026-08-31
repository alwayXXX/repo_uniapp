import { asSdkResult, getRdb, throwIfError } from './cloudbase'
import { ensureSession } from './auth'
import { AppError, isRecord } from '@/utils/error'
import type { DeviceDoc, DeviceStatus, ListDevicesParams, ListDevicesResult } from '@/types/device'
import type { DeviceFormValues } from '@/validators/device'

const DEVICES = 'devices'

const VALID_STATUSES: readonly DeviceStatus[] = ['IN_USE', 'IDLE', 'SOLD', 'DISCARDED']

const SORT_COLUMNS = {
  createdAt: 'created_at',
  purchaseDate: 'purchase_date',
  name: 'name',
  price: 'purchase_price_cents',
} as const

interface DeviceRow {
  id: string
  user_id: string | null
  category_id: string | null
  name: string
  status: string
  brand: string | null
  model: string | null
  serial_number: string | null
  purchase_date: string | null
  purchase_channel: string | null
  purchase_price_cents: number | null
  currency: string
  notes: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

function isDeviceStatus(value: string): value is DeviceStatus {
  return (VALID_STATUSES as readonly string[]).includes(value)
}

function toDeviceDoc(row: DeviceRow): DeviceDoc {
  return {
    id: row.id,
    userId: row.user_id,
    categoryId: row.category_id,
    name: row.name,
    status: isDeviceStatus(row.status) ? row.status : 'IN_USE',
    brand: row.brand ?? null,
    model: row.model ?? null,
    serialNumber: row.serial_number ?? null,
    purchaseDate: row.purchase_date ?? null,
    purchaseChannel: row.purchase_channel ?? null,
    purchasePriceCents: row.purchase_price_cents ?? null,
    currency: row.currency || 'CNY',
    notes: row.notes ?? null,
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseRows(raw: unknown): DeviceRow[] {
  if (!Array.isArray(raw)) {
    throw new AppError('INTERNAL_ERROR', '设备数据格式错误')
  }
  return raw.filter(
    (row): row is DeviceRow =>
      isRecord(row) && typeof row.id === 'string' && typeof row.name === 'string',
  )
}

/** 列表（docs/API.md 7.1）：RLS 限定本人 + deleted_at IS NULL；keyword 搜名称/品牌/型号 */
export async function listDevices(params: ListDevicesParams): Promise<ListDevicesResult> {
  const rdb = getRdb()
  let query = rdb.from(DEVICES).select('*', { count: 'exact' }).is('deleted_at', null)

  const keyword = params.keyword?.trim()
  if (keyword) {
    // 剥离可能破坏 or 语法的字符；关键词跨名称/品牌/型号
    const safe = keyword.replace(/[%,()]/g, ' ')
    query = query.or(`name.ilike.%${safe}%,brand.ilike.%${safe}%,model.ilike.%${safe}%`)
  }
  if (params.categoryId) {
    query = query.eq('category_id', params.categoryId)
  }
  if (params.status) {
    query = query.eq('status', params.status)
  }
  query = query.order(SORT_COLUMNS[params.sortBy], { ascending: params.sortOrder === 'asc' })

  const from = (params.page - 1) * params.pageSize
  query = query.range(from, from + params.pageSize - 1)

  const result = asSdkResult<unknown>(await query)
  throwIfError(result.error, '读取设备列表失败')
  const items = parseRows(result.data).map(toDeviceDoc)
  const total = typeof result.count === 'number' ? result.count : items.length
  return { items, total, hasMore: from + items.length < total }
}

/** 单台设备（编辑表单回填）；不存在或非本人时返回 null */
export async function getDevice(id: string): Promise<DeviceDoc | null> {
  const rdb = getRdb()
  const result = asSdkResult<unknown>(
    await rdb.from(DEVICES).select('*').eq('id', id).is('deleted_at', null).limit(1),
  )
  throwIfError(result.error, '读取设备失败')
  const rows = parseRows(result.data)
  return rows[0] ? toDeviceDoc(rows[0]) : null
}

/** 创建（docs/API.md 7.3）：归属由数据库 DEFAULT auth.uid() 写入 */
export async function createDevice(values: DeviceFormValues): Promise<string> {
  await ensureSession()
  const rdb = getRdb()
  const result = asSdkResult<unknown>(
    await rdb
      .from(DEVICES)
      .insert({
        category_id: values.categoryId,
        name: values.name,
        status: values.status,
        brand: values.brand,
        model: values.model,
        serial_number: values.serialNumber,
        purchase_date: values.purchaseDate,
        purchase_channel: values.purchaseChannel,
        purchase_price_cents: values.purchasePriceCents,
        notes: values.notes,
      })
      .select(),
  )
  throwIfError(result.error, '创建设备失败')
  const rows = parseRows(result.data)
  const created = rows[0]
  if (!created) {
    throw new AppError('INTERNAL_ERROR', '创建设备未返回数据')
  }
  return created.id
}

/** 编辑（docs/API.md 7.4）：仅本人行，RLS 兜底 */
export async function updateDevice(id: string, values: DeviceFormValues): Promise<void> {
  await ensureSession()
  const rdb = getRdb()
  const result = asSdkResult<unknown>(
    await rdb
      .from(DEVICES)
      .update({
        category_id: values.categoryId,
        name: values.name,
        status: values.status,
        brand: values.brand,
        model: values.model,
        serial_number: values.serialNumber,
        purchase_date: values.purchaseDate,
        purchase_channel: values.purchaseChannel,
        purchase_price_cents: values.purchasePriceCents,
        notes: values.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .is('deleted_at', null),
  )
  throwIfError(result.error, '保存设备失败')
}

/** 软删除（docs/API.md 7.5 / DATABASE.md 删除策略）：置 deleted_at，返回删除时间 */
export async function softDeleteDevice(id: string): Promise<string> {
  await ensureSession()
  const rdb = getRdb()
  const deletedAt = new Date().toISOString()
  const result = asSdkResult<unknown>(
    await rdb
      .from(DEVICES)
      .update({ deleted_at: deletedAt, updated_at: deletedAt })
      .eq('id', id)
      .is('deleted_at', null),
  )
  throwIfError(result.error, '删除设备失败')
  return deletedAt
}
