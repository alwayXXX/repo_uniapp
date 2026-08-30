<template>
  <view class="page">
    <view class="toolbar">
      <input
        class="search"
        :value="store.keyword"
        placeholder="搜索名称 / 品牌 / 型号"
        @input="onKeywordInput"
        @confirm="store.loadFirst()"
      />
    </view>

    <view class="filters">
      <picker mode="selector" :range="categoryOptions" @change="onCategoryChange">
        <view class="filter-chip" :class="{ active: store.categoryId !== '' }">
          {{ categoryFilterLabel }}
        </view>
      </picker>
      <picker mode="selector" :range="statusFilterLabels" @change="onStatusChange">
        <view class="filter-chip" :class="{ active: store.deviceStatus !== '' }">
          {{ statusFilterLabel }}
        </view>
      </picker>
      <picker mode="selector" :range="sortLabels" @change="onSortChange">
        <view class="filter-chip">{{ sortLabel }}</view>
      </picker>
    </view>

    <StatusView
      :state="store.status"
      :empty-title="store.hasFilter ? '无匹配设备' : '暂无设备'"
      :empty-hint="store.hasFilter ? '试试调整搜索或筛选条件' : '添加第一台设备，开始你的设备台账'"
      :error-text="store.errorText"
      @retry="store.loadFirst()"
    >
      <template #empty-action>
        <button v-if="store.hasFilter" class="ghost-button" @click="store.clearFilters()">
          清空筛选
        </button>
        <button class="primary-button" @click="gotoEdit('')">添加设备</button>
      </template>

      <view class="list">
        <view v-for="device in store.items" :key="device.id" class="device-card">
          <view class="device-main" @click="gotoEdit(device.id)">
            <view class="device-head">
              <text class="device-name">{{ device.name }}</text>
              <text class="status-badge" :class="device.status.toLowerCase()">
                {{ statusLabel(device.status) }}
              </text>
            </view>
            <text class="device-meta">
              {{ categoryName(device) }} · {{ device.purchaseDate || '未填购买日期' }}
            </text>
            <text class="device-price">
              {{
                device.purchasePriceCents === null
                  ? '价格未填'
                  : '¥' + yuan(device.purchasePriceCents)
              }}
            </text>
          </view>
          <text class="delete-link" @click.stop="askDelete(device)">删除</text>
        </view>

        <view v-if="store.loadingMore" class="more">
          <text class="more-text">加载中…</text>
        </view>
        <view v-else-if="store.hasMore" class="more">
          <text class="more-text">上拉加载更多</text>
        </view>
        <view v-else-if="store.items.length > 0" class="more">
          <text class="more-text">共 {{ store.total }} 台设备</text>
        </view>
      </view>
    </StatusView>

    <view v-if="deleteTarget" class="mask" @click="deleteTarget = null">
      <view class="confirm-card" @click.stop>
        <text class="confirm-title">删除设备</text>
        <text class="confirm-text">
          将删除「{{ deleteTarget.name }}」，删除后列表与统计不再显示（软删除）。
        </text>
        <view class="confirm-actions">
          <button class="cancel-button" @click="deleteTarget = null">取消</button>
          <button class="danger-button" :disabled="deleting" @click="confirmDelete">
            {{ deleting ? '删除中…' : '删除' }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app'
import { useDeviceStore } from '@/stores/device'
import { centsToYuan } from '@/utils/money'
import { DEVICE_STATUS_LABELS, DEVICE_SORT_OPTIONS } from '@/constants/device'
import StatusView from '@/components/StatusView.vue'
import type { DeviceDoc } from '@/types/device'

const store = useDeviceStore()
const deleteTarget = ref<DeviceDoc | null>(null)
const deleting = ref(false)

onShow(() => {
  void store.ensureCategories()
  if (store.status === 'idle') {
    void store.loadFirst()
  }
})

onReachBottom(() => {
  void store.loadMore()
})

onPullDownRefresh(() => {
  store
    .loadFirst()
    .catch(() => undefined)
    .finally(() => uni.stopPullDownRefresh())
})

function statusLabel(value: DeviceDoc['status']): string {
  return DEVICE_STATUS_LABELS[value]
}

function categoryName(device: DeviceDoc): string {
  const name = store.categoryNameOf(device.categoryId)
  return name === '' ? '未分类' : name
}

function yuan(cents: number): string {
  return centsToYuan(cents)
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
function onKeywordInput(event: unknown): void {
  const value = (event as { detail?: { value?: string } }).detail?.value ?? ''
  store.setKeyword(value)
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    void store.loadFirst()
  }, 500)
}

const categoryOptions = computed(() => ['全部分类', ...store.categories.map((c) => c.name)])
const categoryFilterLabel = computed(() =>
  store.categoryId === ''
    ? '分类'
    : (store.categories.find((c) => c.id === store.categoryId)?.name ?? '分类'),
)

function onCategoryChange(event: { detail: { value: string | number } }): void {
  const index = Number(event.detail.value)
  if (Number.isNaN(index) || index <= 0) {
    store.setCategoryFilter('')
    return
  }
  const category = store.categories[index - 1]
  store.setCategoryFilter(category ? category.id : '')
}

const statusFilterLabels = ['全部状态', ...Object.values(DEVICE_STATUS_LABELS)]
const statusFilterValues = ['', 'IN_USE', 'IDLE', 'SOLD', 'DISCARDED']
const statusFilterLabel = computed(() =>
  store.deviceStatus === ''
    ? '状态'
    : (DEVICE_STATUS_LABELS[store.deviceStatus as keyof typeof DEVICE_STATUS_LABELS] ?? '状态'),
)

function onStatusChange(event: { detail: { value: string | number } }): void {
  const index = Number(event.detail.value)
  const value = statusFilterValues[index] ?? ''
  store.setStatusFilter(value as DeviceDoc['status'] | '')
}

const sortLabels = DEVICE_SORT_OPTIONS.map((option) => option.label)
const sortLabel = computed(() => {
  const current = `${store.sortBy}:${store.sortOrder}`
  return DEVICE_SORT_OPTIONS.find((option) => option.value === current)?.label ?? '排序'
})

function onSortChange(event: { detail: { value: string | number } }): void {
  const option = DEVICE_SORT_OPTIONS[Number(event.detail.value)]
  if (!option) return
  const [by, order] = option.value.split(':')
  store.setSort(by as typeof store.sortBy, order as 'asc' | 'desc')
}

function gotoEdit(id: string): void {
  uni.navigateTo({ url: `/pages/devices/edit${id ? `?id=${id}` : ''}` })
}

function askDelete(device: DeviceDoc): void {
  deleteTarget.value = device
}

function confirmDelete(): void {
  const target = deleteTarget.value
  if (!target || deleting.value) return
  deleting.value = true
  store
    .removeDevice(target.id)
    .then(() => {
      deleteTarget.value = null
      if (store.items.length === 0) void store.loadFirst()
      uni.showToast({ title: '已删除', icon: 'none' })
    })
    .catch(() => uni.showToast({ title: '删除失败，请重试', icon: 'none' }))
    .finally(() => {
      deleting.value = false
    })
}
</script>

<style scoped lang="scss">
.page {
  padding: $gf-space-md $gf-space-md $gf-space-xl;
  min-height: 100vh;
  box-sizing: border-box;
}

.toolbar {
  margin-bottom: $gf-space-sm;
}

.search {
  padding: $gf-space-sm $gf-space-md;
  font-size: $gf-font-md;
  background-color: $gf-bg-card;
  border-radius: $gf-radius-md;
}

.filters {
  display: flex;
  flex-direction: row;
  gap: $gf-space-sm;
  margin-bottom: $gf-space-md;
}

.filter-chip {
  padding: 8rpx $gf-space-md;
  font-size: $gf-font-sm;
  color: $gf-text-2;
  background-color: $gf-bg-card;
  border-radius: $gf-radius-md;
}

.filter-chip.active {
  color: $gf-color-primary;
  background-color: $gf-color-primary-weak;
}

.list {
  min-height: 300rpx;
}

.device-card {
  position: relative;
  margin-bottom: $gf-space-sm;
  padding: $gf-space-md;
  background-color: $gf-bg-card;
  border-radius: $gf-radius-lg;
}

.device-main {
  padding-bottom: $gf-space-sm;
}

.device-head {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.device-name {
  font-size: $gf-font-lg;
  font-weight: 600;
  color: $gf-text-1;
}

.status-badge {
  padding: 4rpx 12rpx;
  font-size: $gf-font-xs;
  border-radius: $gf-radius-sm;
  color: $gf-color-primary;
  background-color: $gf-color-primary-weak;
}

.status-badge.idle {
  color: $gf-color-warning;
  background-color: #fff3e8;
}

.status-badge.sold,
.status-badge.discarded {
  color: $gf-text-3;
  background-color: $gf-bg-page;
}

.device-meta {
  display: block;
  margin-top: $gf-space-xs;
  font-size: $gf-font-sm;
  color: $gf-text-3;
}

.device-price {
  display: block;
  margin-top: $gf-space-xs;
  font-size: $gf-font-md;
  color: $gf-text-1;
}

.delete-link {
  position: absolute;
  right: $gf-space-md;
  bottom: $gf-space-sm;
  padding: 4rpx 8rpx;
  font-size: $gf-font-xs;
  color: $gf-text-3;
}

.more {
  padding: $gf-space-md 0;
  text-align: center;
}

.more-text {
  font-size: $gf-font-xs;
  color: $gf-text-3;
}

.mask {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.45);
}

.confirm-card {
  width: 560rpx;
  padding: $gf-space-lg;
  background-color: $gf-bg-card;
  border-radius: $gf-radius-lg;
}

.confirm-title {
  font-size: $gf-font-lg;
  font-weight: 600;
  color: $gf-text-1;
}

.confirm-text {
  display: block;
  margin-top: $gf-space-sm;
  font-size: $gf-font-sm;
  color: $gf-text-2;
  line-height: 1.6;
}

.confirm-actions {
  display: flex;
  flex-direction: row;
  gap: $gf-space-sm;
  margin-top: $gf-space-lg;
}

.confirm-actions button {
  flex: 1;
  font-size: $gf-font-md;
  border-radius: $gf-radius-md;
}

.cancel-button {
  color: $gf-text-2;
  background-color: $gf-bg-page;
}

.danger-button {
  color: #ffffff;
  background-color: $gf-color-danger;
}

.primary-button {
  margin: $gf-space-sm $gf-space-sm 0;
  padding: 0 $gf-space-xl;
  font-size: $gf-font-md;
  color: #ffffff;
  background-color: $gf-color-primary;
  border-radius: $gf-radius-md;
}

.ghost-button {
  margin: $gf-space-sm 0 0;
  padding: 0 $gf-space-xl;
  font-size: $gf-font-md;
  color: $gf-text-2;
  background-color: $gf-bg-page;
  border-radius: $gf-radius-md;
}
</style>
