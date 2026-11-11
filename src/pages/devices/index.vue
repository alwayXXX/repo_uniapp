<template>
  <view class="page wot-text-text-main">
    <view class="page-header">
      <view class="heading-copy">
        <text class="eyebrow">MY GEAR</text>
        <text class="page-title">我的设备</text>
        <text class="page-subtitle">你的设备档案都在这里</text>
      </view>
      <view class="header-actions">
        <wd-button
          type="primary"
          variant="subtle"
          icon="download"
          size="small"
          class="header-action"
          :disabled="exporting"
          @click="exportDevicesCsv"
        >
          导出
        </wd-button>
        <wd-button
          type="primary"
          icon="plus"
          size="small"
          class="header-action"
          @click="gotoCreate"
        >
          添加
        </wd-button>
      </view>
    </view>

    <view class="toolbar">
      <wd-search
        :model-value="store.keyword"
        custom-style="--wot-search-plain-bg: transparent; --wot-search-padding: 0; --wot-search-input-height: 48px; --wot-search-input-radius: 16rpx;"
        placeholder="搜索名称、品牌或型号"
        hide-cancel
        placeholder-left
        @update:model-value="onKeywordInput"
        @search="store.loadFirst()"
        @clear="clearKeyword"
      />
    </view>

    <scroll-view class="filters-scroll" scroll-x :show-scrollbar="false">
      <view class="filters">
        <GearPicker mode="selector" :range="categoryOptions" @change="onCategoryChange">
          <view class="filter-chip" :class="{ active: store.categoryId !== '' }">
            {{ categoryFilterLabel }}
          </view>
        </GearPicker>
        <GearPicker mode="selector" :range="statusFilterLabels" @change="onStatusChange">
          <view class="filter-chip" :class="{ active: store.deviceStatus !== '' }">
            {{ statusFilterLabel }}
          </view>
        </GearPicker>
        <GearPicker mode="selector" :range="sortLabels" @change="onSortChange">
          <view class="filter-chip">{{ sortLabel }}</view>
        </GearPicker>
      </view>
    </scroll-view>

    <StatusView
      :state="store.status"
      :empty-title="store.hasFilter ? '无匹配设备' : '暂无设备'"
      :empty-hint="store.hasFilter ? '试试调整搜索或筛选条件' : '添加第一台设备，开始你的设备台账'"
      :error-text="store.errorText"
      @retry="store.loadFirst()"
    >
      <template #empty-action>
        <wd-button
          v-if="store.hasFilter"
          type="primary"
          variant="soft"
          class="ghost-button"
          @click="store.clearFilters()"
        >
          清空筛选
        </wd-button>
        <wd-button type="primary" class="primary-button" @click="gotoCreate()">添加设备</wd-button>
      </template>

      <view class="list">
        <view v-for="device in store.items" :key="device.id" class="device-card">
          <view class="device-main" @click="gotoDetail(device.id)">
            <view class="device-symbol"><wd-icon name="apps" size="22px" color="#3977c9" /></view>
            <view class="device-body">
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
                    : formatMoney(device.purchasePriceCents, device.currency)
                }}
              </text>
            </view>
          </view>
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
  </view>
</template>

<script setup lang="ts">
import GearPicker from '@/components/GearPicker.vue'
import { computed, ref } from 'vue'
import { onHide, onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app'
import { useDeviceStore } from '@/stores/device'
import { listDevices } from '@/services/device'
import { ensureSession } from '@/services/auth'
import { requireCurrentConsent } from '@/services/consent'
import { assertClientRevision, clientRevision } from '@/services/client-state'
import { buildDevicesCsv, csvFileName, saveAndShareCsv } from '@/services/export'
import { toAppError } from '@/utils/error'
import { formatMoney } from '@/utils/money'
import { DEVICE_STATUS_LABELS, DEVICE_SORT_OPTIONS } from '@/constants/device'
import StatusView from '@/components/StatusView.vue'
import type { DeviceDoc } from '@/types/device'

const store = useDeviceStore()

const exporting = ref(false)

/** 导出全部设备清单 CSV（分页拉全量，云函数按 OPENID 仅返回本人数据） */
async function exportDevicesCsv(): Promise<void> {
  if (exporting.value) return
  exporting.value = true
  const revision = clientRevision()
  try {
    await ensureSession()
    await store.ensureCategories()
    const all: DeviceDoc[] = []
    const pageSize = 50
    for (let page = 1; ; page += 1) {
      const result = await listDevices({ sortBy: 'createdAt', sortOrder: 'desc', page, pageSize })
      assertClientRevision(revision)
      all.push(...result.items)
      if (!result.hasMore) break
    }
    if (all.length === 0) {
      uni.showToast({ title: '还没有设备可导出', icon: 'none' })
      return
    }
    const csv = buildDevicesCsv(all, (id) => store.categoryNameOf(id))
    await saveAndShareCsv(csvFileName('gearflow_设备清单'), csv, revision)
  } catch (err) {
    uni.showToast({ title: toAppError(err).message, icon: 'none' })
  } finally {
    exporting.value = false
  }
}

async function refreshDevices(): Promise<void> {
  const revision = clientRevision()
  try {
    // 每次进入都刷新：详情页的编辑/软删除需要同步回列表
    await ensureSession()
    await store.ensureCategories()
    assertClientRevision(revision)
    const pendingCategory = uni.getStorageSync('gf_stats_category_id')
    if (typeof pendingCategory === 'string') {
      uni.removeStorageSync('gf_stats_category_id')
      const categoryExists = store.categories.some((item) => item.id === pendingCategory)
      store.setCategoryFilter(categoryExists ? pendingCategory : '')
      return
    }
    await store.loadFirst()
  } catch (err) {
    if (revision !== clientRevision()) return
    const error = toAppError(err)
    store.errorText = error.message
    store.status = error.code === 'FORBIDDEN' ? 'forbidden' : 'error'
  }
}

onShow(() => {
  if (!requireCurrentConsent()) return
  void refreshDevices()
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

let searchTimer: ReturnType<typeof setTimeout> | null = null
onHide(() => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = null
})
function onKeywordInput(value: string): void {
  store.setKeyword(value)
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    void store.loadFirst()
  }, 500)
}

function clearKeyword(): void {
  if (searchTimer) clearTimeout(searchTimer)
  store.setKeyword('')
  void store.loadFirst()
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

function gotoCreate(): void {
  uni.navigateTo({ url: '/pages/devices/edit' })
}

function gotoDetail(id: string): void {
  uni.navigateTo({ url: `/pages/devices/detail?id=${id}` })
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  padding: 40rpx 32rpx calc(64rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.page-header {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  gap: $gf-space-md;
  margin-bottom: 40rpx;
}

.heading-copy {
  min-width: 0;
  flex: 1;
}

.eyebrow {
  display: block;
  font-size: $gf-font-xs;
  font-weight: 600;
  letter-spacing: 2rpx;
  color: #51769f;
}

.page-title {
  display: block;
  margin-top: 16rpx;
  font-size: 48rpx;
  font-weight: 700;
  line-height: 1.25;
  color: $gf-text-1;
}

.page-subtitle {
  display: block;
  margin-top: 8rpx;
  font-size: $gf-font-sm;
  line-height: 1.45;
  color: $gf-text-3;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.header-action {
  flex-shrink: 0;
  height: 72rpx;
  min-height: 72rpx;
  margin: 8rpx 0 0;
  padding: 0 20rpx;
  font-size: $gf-font-sm;
  font-weight: 600;
  line-height: 72rpx;
  color: $gf-color-primary;
  background-color: $gf-color-primary-weak;
  border-radius: $gf-control-radius;
}

.header-action-mark {
  margin-right: 4rpx;
  font-size: 30rpx;
  line-height: 1;
}

.toolbar {
  margin-bottom: $gf-space-md;
}

.search-field {
  display: flex;
  flex-direction: row;
  align-items: center;
  min-width: 0;
  padding: 0 20rpx;
  background-color: $gf-bg-card;
  border: 1rpx solid $gf-line;
  border-radius: $gf-control-radius;
  box-shadow: $gf-shadow-sm;
}

.search-mark,
.search-clear {
  flex-shrink: 0;
  color: $gf-text-3;
  text-align: center;
}

.search-mark {
  width: 32rpx;
  margin-right: 12rpx;
  font-size: 34rpx;
  line-height: 1;
}

.search {
  min-width: 0;
  flex: 1;
  height: $gf-control-height;
  min-height: $gf-control-height;
  padding: 0;
  font-size: $gf-font-md;
  line-height: $gf-control-height;
  color: $gf-text-1;
  background-color: transparent;
  box-sizing: border-box;
  overflow: hidden;
}

.search-clear {
  width: 40rpx;
  height: 40rpx;
  margin-left: 12rpx;
  font-size: 34rpx;
  line-height: 36rpx;
  color: $gf-text-2;
}

.filters-scroll {
  width: 100%;
  margin-bottom: 32rpx;
  white-space: nowrap;
}

.filters {
  display: inline-flex;
  flex-direction: row;
  gap: $gf-space-sm;
  vertical-align: top;
}

.filters picker {
  flex-shrink: 0;
}

.filter-chip {
  min-width: 176rpx;
  height: 48px;
  padding: 0 $gf-space-md;
  font-size: $gf-font-sm;
  line-height: 48px;
  color: $gf-text-2;
  background-color: $gf-bg-card;
  border: 1rpx solid $gf-line;
  border-radius: 100rpx;
  box-sizing: border-box;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.filter-chip.active {
  color: $gf-color-primary-strong;
  background-color: $gf-color-primary-weak;
}

.list {
  min-height: 300rpx;
}

.device-card {
  position: relative;
  margin-bottom: $gf-space-sm;
  padding: 32rpx;
  background-color: $gf-bg-card;
  border-radius: 28rpx;
  border: 1rpx solid #edf0f3;
  box-shadow: $gf-shadow-sm;
  box-sizing: border-box;
}

.device-main {
  display: flex;
  align-items: flex-start;
  gap: 24rpx;
}

.device-symbol {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 76rpx;
  height: 76rpx;
  border-radius: 22rpx;
  background: #ebf3ff;
}

.device-body {
  min-width: 0;
  flex: 1;
}

.device-head {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: $gf-space-sm;
}

.device-name {
  min-width: 0;
  flex: 1;
  font-size: $gf-font-lg;
  line-height: 1.35;
  font-weight: 600;
  color: $gf-text-1;
  word-break: break-word;
}

.status-badge {
  flex-shrink: 0;
  min-height: 48rpx;
  padding: 0 12rpx;
  font-size: $gf-font-xs;
  line-height: 48rpx;
  border-radius: $gf-radius-sm;
  color: $gf-color-primary;
  background-color: $gf-color-primary-weak;
}

.status-badge.in_use {
  color: $gf-color-success;
  background-color: $gf-color-success-weak;
}

.status-badge.idle {
  color: $gf-color-warning;
  background-color: $gf-color-warning-weak;
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
  line-height: 1.45;
  color: $gf-text-3;
  word-break: break-word;
}

.device-price {
  display: block;
  margin-top: 20rpx;
  font-size: $gf-font-md;
  line-height: 1.4;
  color: #243b55;
  font-weight: 600;
  word-break: break-all;
}

.more {
  padding: $gf-space-md 0;
  text-align: center;
}

.more-text {
  font-size: $gf-font-xs;
  color: $gf-text-3;
}

.primary-button {
  width: calc(100% - 32rpx);
  height: 88rpx;
  min-height: 88rpx;
  margin: $gf-space-sm $gf-space-sm 0;
  padding: 0 $gf-space-lg;
  font-size: $gf-font-md;
  font-weight: 600;
  line-height: 88rpx;
  color: #ffffff;
  background-color: $gf-color-primary;
  border-radius: $gf-control-radius;
}

.ghost-button {
  width: calc(100% - 32rpx);
  height: 80rpx;
  min-height: 80rpx;
  margin: $gf-space-sm 0 0;
  padding: 0 $gf-space-lg;
  font-size: $gf-font-md;
  line-height: 80rpx;
  color: $gf-text-2;
  background-color: $gf-bg-page;
  border: 1rpx solid $gf-line;
  border-radius: $gf-control-radius;
}
</style>
