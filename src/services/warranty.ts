import { callGearFlowApi } from './cloudbase'
import { AppError, isRecord } from '@/utils/error'
import type { WarrantyDoc } from '@/types/maintenance'
import { ensureSession } from './auth'

function expectWarranty(value: unknown): WarrantyDoc {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.deviceId !== 'string' ||
    typeof value.endDate !== 'string'
  ) {
    throw new AppError('INTERNAL_ERROR', '保修数据格式错误')
  }
  return value as unknown as WarrantyDoc
}

function parseWarrantyOrNull(value: unknown): WarrantyDoc | null {
  if (value === null || value === undefined) return null
  return expectWarranty(value)
}

/** 某设备的保修（一设备一保修）；未填写返回 null。 */
export async function getWarranty(deviceId: string): Promise<WarrantyDoc | null> {
  await ensureSession()
  const data = await callGearFlowApi<{ item: unknown }>('warranty.get', { deviceId })
  return parseWarrantyOrNull(data.item)
}

/** 本人全部保修，供首页临期看板使用。 */
export async function listWarranties(limit = 100): Promise<WarrantyDoc[]> {
  await ensureSession()
  const data = await callGearFlowApi<{ items: unknown[] }>('warranty.list', { limit })
  return data.items.map(expectWarranty)
}
