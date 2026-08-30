import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getCategoryName, listCategories } from '@/services/category'
import { ensureSession } from '@/services/auth'
import {
  listDevices as listDevicesApi,
  softDeleteDevice as softDeleteDeviceApi,
} from '@/services/device'
import { toAppError } from '@/utils/error'
import type { DeviceCategory } from '@/types/device'
import type { DeviceDoc, DeviceStatus } from '@/types/device'
import type { PageState } from '@/types/api/common'

const PAGE_SIZE = 20

/**
 * 设备列表 Store（docs/ARCHITECTURE.md 核心模块）：列表、筛选、分页。
 * 分类名映射走 services/category 的进程内缓存。
 */
export const useDeviceStore = defineStore('device', () => {
  const items = ref<DeviceDoc[]>([])
  const total = ref(0)
  const page = ref(1)
  const status = ref<PageState>('idle')
  const errorText = ref('')
  const loadingMore = ref(false)

  const keyword = ref('')
  const categoryId = ref('')
  const deviceStatus = ref<DeviceStatus | ''>('')
  const sortBy = ref<'createdAt' | 'purchaseDate' | 'name' | 'price'>('createdAt')
  const sortOrder = ref<'asc' | 'desc'>('desc')

  const categories = ref<DeviceCategory[]>([])

  const hasMore = computed(() => items.value.length < total.value)
  const hasFilter = computed(
    () => keyword.value.trim() !== '' || categoryId.value !== '' || deviceStatus.value !== '',
  )

  /** 分类名（列表卡片展示用） */
  function categoryNameOf(id: string | null): string {
    return id ? getCategoryName(id) : ''
  }

  async function ensureCategories(): Promise<DeviceCategory[]> {
    if (categories.value.length === 0) {
      categories.value = await listCategories()
    }
    return categories.value
  }

  async function loadFirst(): Promise<void> {
    status.value = 'loading'
    errorText.value = ''
    try {
      // 自愈过期会话：冷启动恢复的令牌可能已过 2 小时时效
      await ensureSession()
      const result = await listDevicesApi({
        keyword: keyword.value.trim() || undefined,
        categoryId: categoryId.value || undefined,
        status: deviceStatus.value || undefined,
        sortBy: sortBy.value,
        sortOrder: sortOrder.value,
        page: 1,
        pageSize: PAGE_SIZE,
      })
      items.value = result.items
      total.value = result.total
      page.value = 1
      status.value = result.items.length === 0 ? 'empty' : 'success'
    } catch (err) {
      items.value = []
      total.value = 0
      const appError = toAppError(err)
      status.value = appError.code === 'FORBIDDEN' ? 'forbidden' : 'error'
      errorText.value = appError.message
    }
  }

  async function loadMore(): Promise<void> {
    if (loadingMore.value || !hasMore.value || status.value !== 'success') return
    loadingMore.value = true
    try {
      const result = await listDevicesApi({
        keyword: keyword.value.trim() || undefined,
        categoryId: categoryId.value || undefined,
        status: deviceStatus.value || undefined,
        sortBy: sortBy.value,
        sortOrder: sortOrder.value,
        page: page.value + 1,
        pageSize: PAGE_SIZE,
      })
      const known = new Set(items.value.map((item) => item.id))
      items.value = [...items.value, ...result.items.filter((item) => !known.has(item.id))]
      total.value = result.total
      page.value += 1
    } catch {
      // 加载更多失败不打断已有列表，下拉刷新可重试
    } finally {
      loadingMore.value = false
    }
  }

  function setKeyword(value: string): void {
    keyword.value = value
  }

  function setCategoryFilter(id: string): void {
    categoryId.value = id
    void loadFirst()
  }

  function setStatusFilter(value: DeviceStatus | ''): void {
    deviceStatus.value = value
    void loadFirst()
  }

  function setSort(sortByValue: typeof sortBy.value, order: typeof sortOrder.value): void {
    sortBy.value = sortByValue
    sortOrder.value = order
    void loadFirst()
  }

  function clearFilters(): void {
    keyword.value = ''
    categoryId.value = ''
    deviceStatus.value = ''
    void loadFirst()
  }

  /** 软删除后同步本地列表 */
  async function removeDevice(id: string): Promise<void> {
    await softDeleteDeviceApi(id)
    items.value = items.value.filter((item) => item.id !== id)
    total.value = Math.max(0, total.value - 1)
  }

  return {
    items,
    total,
    status,
    errorText,
    loadingMore,
    keyword,
    categoryId,
    deviceStatus,
    sortBy,
    sortOrder,
    categories,
    hasMore,
    hasFilter,
    ensureCategories,
    categoryNameOf,
    loadFirst,
    loadMore,
    setKeyword,
    setCategoryFilter,
    setStatusFilter,
    setSort,
    clearFilters,
    removeDevice,
  }
})
