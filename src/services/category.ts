import { asSdkResult, getRdb, throwIfError } from './cloudbase'
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
  const rdb = getRdb()
  const result = asSdkResult<unknown>(
    await rdb
      .from('device_categories')
      .select('*')
      .eq('scope', 'SYSTEM')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  )
  throwIfError(result.error, '读取分类失败')
  if (!Array.isArray(result.data)) {
    throw new AppError('INTERNAL_ERROR', '分类数据格式错误')
  }
  const rows = result.data.filter(
    (row): row is { id: string; code: string; name: string; sort_order: number } =>
      isRecord(row) &&
      typeof row.id === 'string' &&
      typeof row.code === 'string' &&
      typeof row.name === 'string' &&
      typeof row.sort_order === 'number',
  )
  cache = rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    sortOrder: row.sort_order,
  }))
  return cache
}
