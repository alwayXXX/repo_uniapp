import { asSdkResult, callRpc, getRdb, throwIfError } from './cloudbase'
import { ensureSession } from './auth'
import { AppError, isRecord } from '@/utils/error'
import type { ApiErrorCode } from '@/types/api/common'
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

const RPC_ERROR_CODES: readonly ApiErrorCode[] = [
  'UNAUTHORIZED',
  'VALIDATION_ERROR',
  'FORBIDDEN',
  'RESOURCE_NOT_FOUND',
  'DEVICE_NOT_FOUND',
  'CATEGORY_NOT_FOUND',
  'DATE_RANGE_INVALID',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'IDENTITY_BOOTSTRAP_FAILED',
]

function throwRpcFailure(data: unknown, fallbackMessage: string): never {
  const code = isRecord(data) && typeof data.errorCode === 'string' ? data.errorCode : ''
  const appCode = (RPC_ERROR_CODES as readonly string[]).includes(code)
    ? (code as ApiErrorCode)
    : 'INTERNAL_ERROR'
  throw new AppError(appCode, fallbackMessage)
}

export interface DeviceWarrantyInput {
  mode: 'KEEP' | 'SET' | 'CLEAR'
  startDate?: string | null
  endDate?: string | null
  provider?: string | null
}

export interface SaveDeviceResult {
  id: string
  created: boolean
}

/** 设备 + 保修单事务保存；客户端不直接写 devices / warranties。 */
export async function saveDeviceWithWarranty(
  deviceId: string | null,
  values: DeviceFormValues,
  warranty: DeviceWarrantyInput,
): Promise<SaveDeviceResult> {
  await ensureSession()
  const result = asSdkResult<unknown>(
    await callRpc('gf_save_device_with_warranty', {
      p_device_id: deviceId,
      p_category_id: values.categoryId,
      p_name: values.name,
      p_status: values.status,
      p_brand: values.brand,
      p_model: values.model,
      p_serial_number: values.serialNumber,
      p_purchase_date: values.purchaseDate,
      p_purchase_channel: values.purchaseChannel,
      p_purchase_price_cents: values.purchasePriceCents,
      p_notes: values.notes,
      p_warranty_mode: warranty.mode,
      p_warranty_start_date: warranty.startDate ?? null,
      p_warranty_end_date: warranty.endDate ?? null,
      p_warranty_provider: warranty.provider ?? null,
    }),
  )
  throwIfError(result.error, '保存设备失败')
  const data = result.data
  if (!isRecord(data) || data.ok !== true || typeof data.id !== 'string') {
    return throwRpcFailure(data, '保存设备失败，请检查输入后重试')
  }
  return { id: data.id, created: data.created === true }
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
  const result = await saveDeviceWithWarranty(null, values, { mode: 'CLEAR' })
  return result.id
}

/** 编辑（docs/API.md 7.4）：仅本人行，RLS 兜底 */
export async function updateDevice(id: string, values: DeviceFormValues): Promise<void> {
  await saveDeviceWithWarranty(id, values, { mode: 'KEEP' })
}

/** 软删除（docs/API.md 7.5 / DATABASE.md 删除策略）：置 deleted_at，返回删除时间 */
export async function softDeleteDevice(id: string): Promise<string> {
  await ensureSession()
  const result = asSdkResult<unknown>(await callRpc('gf_soft_delete_device', { p_id: id }))
  throwIfError(result.error, '删除设备失败')
  const data = result.data
  if (!isRecord(data) || data.ok !== true || typeof data.deletedAt !== 'string') {
    return throwRpcFailure(data, '删除设备失败，请稍后重试')
  }
  return data.deletedAt
}
