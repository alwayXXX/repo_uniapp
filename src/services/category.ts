import { callGearFlowApi } from './cloudbase'
import { AppError, isRecord } from '@/utils/error'
import type { DeviceCategory } from '@/types/device'
import { ensureSession } from './auth'

/** 系统分类服务：只读数据，进程内缓存（分类极少变化） */
let cache: DeviceCategory[] | null = null

export function getCachedCategories(): DeviceCategory[] {
  return cache ?? []
}

export function getCategoryName(categoryId: string): string {
  return cache?.find((c) => c.id === categoryId)?.name ?? ''
}

export async function listCategories(force = false): Promise<DeviceCategory[]> {
  if (cache && !force) return cache
  await ensureSession()
  const result = await callGearFlowApi<{ items: unknown[] }>('category.list')
  if (!Array.isArray(result.items)) {
    throw new AppError('INTERNAL_ERROR', '分类数据格式错误')
  }
  const rows = result.items.filter(
    (row): row is { id: string; code: string; name: string; sortOrder: number } =>
      isRecord(row) &&
      typeof row.id === 'string' &&
      typeof row.code === 'string' &&
      typeof row.name === 'string' &&
      typeof row.sortOrder === 'number',
  )
  cache = rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    sortOrder: row.sortOrder,
  }))
  return cache
}
