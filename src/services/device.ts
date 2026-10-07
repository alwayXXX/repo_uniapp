import { callGearFlowApi } from './cloudbase'
import { ensureSession } from './auth'
import { AppError, isRecord } from '@/utils/error'
import type { DeviceDoc, ListDevicesParams, ListDevicesResult } from '@/types/device'
import type { DeviceFormValues } from '@/validators/device'

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

function expectDevice(value: unknown): DeviceDoc {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') {
    throw new AppError('INTERNAL_ERROR', '设备数据格式错误')
  }
  return value as unknown as DeviceDoc
}

function parseDeviceOrNull(value: unknown): DeviceDoc | null {
  if (value === null || value === undefined) return null
  return expectDevice(value)
}

/** 设备 + 保修单事务保存；客户端只传业务字段，OPENID 由云函数注入。 */
export async function saveDeviceWithWarranty(
  deviceId: string | null,
  values: DeviceFormValues,
  warranty: DeviceWarrantyInput,
): Promise<SaveDeviceResult> {
  await ensureSession()
  const data = await callGearFlowApi<{ id: string; created: boolean }>('device.save', {
    deviceId,
    categoryId: values.categoryId,
    name: values.name,
    status: values.status,
    brand: values.brand,
    model: values.model,
    serialNumber: values.serialNumber,
    purchaseDate: values.purchaseDate,
    purchaseChannel: values.purchaseChannel,
    purchasePriceCents: values.purchasePriceCents,
    notes: values.notes,
    warranty,
  })
  if (typeof data.id !== 'string') {
    throw new AppError('INTERNAL_ERROR', '保存设备返回格式错误')
  }
  return { id: data.id, created: data.created === true }
}

export async function listDevices(params: ListDevicesParams): Promise<ListDevicesResult> {
  await ensureSession()
  const data = await callGearFlowApi<{
    items: unknown[]
    total: number
    hasMore: boolean
  }>('device.list', params as unknown as Record<string, unknown>)
  return {
    items: data.items.map(expectDevice),
    total: Number(data.total) || 0,
    hasMore: data.hasMore === true,
  }
}

export async function getDevice(id: string): Promise<DeviceDoc | null> {
  await ensureSession()
  const data = await callGearFlowApi<{ item: unknown }>('device.get', { id })
  return parseDeviceOrNull(data.item)
}

export async function createDevice(values: DeviceFormValues): Promise<string> {
  const result = await saveDeviceWithWarranty(null, values, { mode: 'CLEAR' })
  return result.id
}

export async function updateDevice(id: string, values: DeviceFormValues): Promise<void> {
  await saveDeviceWithWarranty(id, values, { mode: 'KEEP' })
}

export async function softDeleteDevice(id: string): Promise<string> {
  await ensureSession()
  const data = await callGearFlowApi<{ deletedAt: string }>('device.softDelete', { id })
  if (typeof data.deletedAt !== 'string') {
    throw new AppError('INTERNAL_ERROR', '删除设备返回格式错误')
  }
  return data.deletedAt
}
