import { asSdkResult, getRdb, throwIfError } from './cloudbase'
import { AppError, isRecord } from '@/utils/error'
import type { DeviceDoc, DeviceStatus } from '@/types/device'

/**
 * Phase 1 数据库验证用的最小设备操作（docs/API.md device.list / device.create）。
 * 数据层为 CloudBase PostgreSQL，通过 JS SDK v3 app.rdb() 访问。
 *
 * 用户隔离模型（docs/DATABASE.md 9.2）：
 * - 归属列 user_id 由数据库 DEFAULT auth.uid() 写入，客户端不可指定；
 * - RLS 策略（USING / WITH CHECK user_id = auth.uid()）在服务端强制隔离，
 *   客户端查询无需（也不能）伪造归属条件。
 */

const DEVICES = 'devices'

/** devices 表物理行（snake_case，服务层负责与 UI 模型映射） */
interface DeviceRow {
  id: string
  user_id: string
  name: string
  status: string
  created_at: string
  updated_at: string
}

export interface CreateDeviceInput {
  name: string
  status?: DeviceStatus
}

function toDeviceDoc(row: DeviceRow): DeviceDoc {
  return {
    _id: row.id,
    userId: row.user_id,
    name: row.name,
    status: (row.status as DeviceStatus) ?? 'IN_USE',
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

export async function createDevice(input: CreateDeviceInput): Promise<string> {
  const rdb = getRdb()
  const result = asSdkResult<unknown>(
    await rdb.from(DEVICES).insert({ name: input.name, status: input.status ?? 'IN_USE' }),
  )
  throwIfError(result.error, '创建设备失败')
  const rows = parseRows(result.data)
  const created = rows[0]
  if (!created) {
    throw new AppError('INTERNAL_ERROR', '创建设备未返回数据')
  }
  return created.id
}

export async function listDevices(limit = 20): Promise<DeviceDoc[]> {
  const rdb = getRdb()
  const result = asSdkResult<unknown>(
    await rdb.from(DEVICES).select('*').order('created_at', { ascending: false }).limit(limit),
  )
  throwIfError(result.error, '读取设备列表失败')
  // RLS 已限定仅返回当前用户的行；此处只做形状校验
  return parseRows(result.data).map(toDeviceDoc)
}

export async function renameDevice(deviceId: string, name: string): Promise<void> {
  const rdb = getRdb()
  const result = asSdkResult<unknown>(
    await rdb
      .from(DEVICES)
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', deviceId),
  )
  throwIfError(result.error, '更新设备失败')
}

export async function removeDevice(deviceId: string): Promise<void> {
  const rdb = getRdb()
  const result = asSdkResult<unknown>(await rdb.from(DEVICES).delete().eq('id', deviceId))
  throwIfError(result.error, '删除设备失败')
}
