<template>
  <view class="page">
    <StatusView :state="loadState" :error-text="errorText" @retry="load">
      <view v-if="device">
        <view class="card hero">
          <view class="hero-head">
            <text class="hero-name">{{ device.name }}</text>
            <text class="status-badge" :class="device.status.toLowerCase()">
              {{ statusLabel }}
            </text>
          </view>
          <text class="hero-sub">{{ categoryLabel }}{{ purchasedAtText }}</text>
        </view>

        <view class="card">
          <text class="card-title">基础信息</text>
          <view class="row">
            <text class="row-label">品牌</text>
            <text class="row-value">{{ device.brand || '未填写' }}</text>
          </view>
          <view class="row">
            <text class="row-label">型号</text>
            <text class="row-value">{{ device.model || '未填写' }}</text>
          </view>
          <view class="row">
            <text class="row-label">序列号</text>
            <text class="row-value">{{ device.serialNumber || '未填写' }}</text>
          </view>
          <view class="row">
            <text class="row-label">备注</text>
            <text class="row-value">{{ device.notes || '未填写' }}</text>
          </view>
        </view>

        <view class="card">
          <text class="card-title">购买信息</text>
          <view class="row">
            <text class="row-label">购买日期</text>
            <text class="row-value">{{ device.purchaseDate || '未填写' }}</text>
          </view>
          <view class="row">
            <text class="row-label">购买渠道</text>
            <text class="row-value">{{ device.purchaseChannel || '未填写' }}</text>
          </view>
          <view class="row">
            <text class="row-label">购买价格</text>
            <text class="row-value">
              {{
                device.purchasePriceCents === null
                  ? '未填写'
                  : formatMoney(device.purchasePriceCents, device.currency)
              }}
            </text>
          </view>
        </view>

        <view class="card">
          <view class="card-title-row">
            <text class="card-title">保修信息</text>
            <text v-if="warrantyState" class="status-badge" :class="warrantyBadgeClass">
              {{ warrantyState.statusLabel }}
            </text>
          </view>
          <template v-if="warranty">
            <view class="row">
              <text class="row-label">保修期限</text>
              <text class="row-value">
                {{ warranty.startDate || '?' }} 至 {{ warranty.endDate }}
              </text>
            </view>
            <view class="row">
              <text class="row-label">保修提供方</text>
              <text class="row-value">{{ warranty.provider || '未填写' }}</text>
            </view>
            <view class="row">
              <text class="row-label">剩余天数</text>
              <text class="row-value">{{ remainingText }}</text>
            </view>
          </template>
          <text v-else class="placeholder">未填写保修——在设备编辑页填写保修日期后自动计算状态</text>
        </view>

        <view class="card">
          <view class="card-title-row">
            <text class="card-title">维护记录</text>
            <button class="add-maintenance" @click="gotoMaintenance('')">+ 添加</button>
          </view>
          <text v-if="maintenanceSubtotal !== null" class="subtotal">
            维护支出合计 {{ formatMoney(maintenanceSubtotal, device.currency) }}
          </text>
          <StatusView
            :state="maintenanceState"
            :error-text="maintenanceErrorText"
            empty-title="暂无维护记录"
            empty-hint="点击右上角「+ 添加」记录第一次维护"
            @retry="loadMaintenances"
          >
            <view
              v-for="record in maintenances"
              :key="record.id"
              class="maint-row"
              :data-maintenance-id="record.id"
              @click="gotoMaintenance(record.id)"
            >
              <view class="maint-main">
                <view class="maint-head">
                  <text class="maint-title">{{ record.title }}</text>
                  <text class="maint-type">{{ typeLabel(record.type) }}</text>
                </view>
                <text class="maint-meta"
                  >{{ record.occurredAt }}{{ record.vendor ? ' · ' + record.vendor : '' }}</text
                >
              </view>
              <text v-if="record.costCents !== null" class="maint-cost">{{
                formatMoney(record.costCents, device.currency)
              }}</text>
            </view>
          </StatusView>
        </view>

        <view class="card">
          <text class="card-title">时间线</text>
          <StatusView
            :state="timelineState"
            loading-text="正在整理时间线…"
            empty-title="暂无时间线"
            empty-hint="设备发生变更后会自动记录在这里"
            :error-text="timelineErrorText"
            @retry="loadTimeline"
          >
            <DeviceTimelineList :items="timelineItems" />
            <button
              v-if="timelineHasMore"
              class="timeline-more-button"
              :disabled="timelineLoadingMore"
              @click="loadMoreTimeline"
            >
              {{ timelineLoadingMore ? '加载中…' : '加载更多' }}
            </button>
          </StatusView>
        </view>

        <view class="card actions">
          <button class="edit-button" @click="gotoEdit">编辑</button>
          <button class="danger-button" :disabled="deleting" @click="askDelete">
            {{ deleting ? '删除中…' : '删除设备' }}
          </button>
          <text class="danger-hint">删除为软删除，数据可追溯且不可被他人访问</text>
        </view>
      </view>
    </StatusView>

    <view v-if="confirmVisible" class="mask" @click="confirmVisible = false">
      <view class="confirm-card" @click.stop>
        <text class="confirm-title">删除设备</text>
        <text class="confirm-text">
          将删除「{{ device?.name }}」，删除后列表与统计不再显示（软删除）。
        </text>
        <view class="confirm-actions">
          <button class="cancel-button" @click="confirmVisible = false">取消</button>
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
import { onLoad, onShow } from '@dcloudio/uni-app'
import { getCategoryName } from '@/services/category'
import { getDevice, softDeleteDevice } from '@/services/device'
import { listDeviceTimeline } from '@/services/timeline'
import { listByDevice } from '@/services/maintenance'
import { getWarranty } from '@/services/warranty'
import { ensureSession } from '@/services/auth'
import { formatMoney } from '@/utils/money'
import { computeWarranty, WARRANTY_STATUS_LABELS } from '@/utils/warranty'
import { toAppError } from '@/utils/error'
import { DEVICE_STATUS_LABELS } from '@/constants/device'
import { MAINTENANCE_TYPE_LABELS } from '@/constants/maintenance'
import StatusView from '@/components/StatusView.vue'
import DeviceTimelineList from '@/components/DeviceTimelineList.vue'
import type { DeviceDoc, MaintenanceType } from '@/types/device'
import type { PageState } from '@/types/api/common'
import type { DeviceTimelineEvent } from '@/types/timeline'
import type { MaintenanceDoc } from '@/types/maintenance'
import type { WarrantyDoc } from '@/types/maintenance'

const device = ref<DeviceDoc | null>(null)
const loadState = ref<PageState>('loading')
const errorText = ref('')
const deleting = ref(false)
const confirmVisible = ref(false)
const warranty = ref<WarrantyDoc | null>(null)

const TIMELINE_PAGE_SIZE = 20
const timelineItems = ref<DeviceTimelineEvent[]>([])
const timelineState = ref<PageState>('idle')
const timelineErrorText = ref('')
const timelinePage = ref(1)
const timelineHasMore = ref(false)
const timelineLoadingMore = ref(false)

const maintenances = ref<MaintenanceDoc[]>([])
const maintenanceState = ref<PageState>('idle')
const maintenanceErrorText = ref('')

const statusLabel = computed(() => (device.value ? DEVICE_STATUS_LABELS[device.value.status] : ''))
const categoryLabel = computed(() => {
  if (!device.value?.categoryId) return '未分类'
  const name = getCategoryName(device.value.categoryId)
  return name === '' ? '未分类' : name
})
const purchasedAtText = computed(() => {
  const date = device.value?.purchaseDate
  return date ? ` · ${date} 购入` : ''
})
const warrantyState = computed(() => {
  if (!warranty.value) return null
  const state = computeWarranty(warranty.value.endDate)
  return { ...state, statusLabel: WARRANTY_STATUS_LABELS[state.status] }
})
const warrantyBadgeClass = computed(() => warrantyState.value?.status.toLowerCase() ?? '')
const remainingText = computed(() => {
  const days = warrantyState.value?.remainingDays
  if (days === null || days === undefined) return '—'
  if (days < 0) return `已过期 ${-days} 天`
  return `剩余 ${days} 天`
})
const maintenanceSubtotal = computed(() => {
  const withCost = maintenances.value.filter((r) => r.costCents !== null)
  if (withCost.length === 0) return null
  return withCost.reduce((sum, r) => sum + (r.costCents ?? 0), 0)
})

function typeLabel(type: MaintenanceType): string {
  return MAINTENANCE_TYPE_LABELS[type]
}

let deviceId = ''

async function load(): Promise<void> {
  loadState.value = 'loading'
  errorText.value = ''
  try {
    await ensureSession()
    const result = await getDevice(deviceId)
    if (!result) {
      // RLS 下他人的设备与不存在的设备同样不可见（docs/PRD 4.3 异常态）
      uni.showToast({ title: '设备不存在或已被删除', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 600)
      return
    }
    device.value = result
    loadState.value = 'success'
    await loadTimeline()
    await loadWarranty()
    await loadMaintenances()
  } catch (err) {
    const appError = toAppError(err)
    errorText.value = appError.message
    loadState.value = appError.code === 'FORBIDDEN' ? 'forbidden' : 'error'
  }
}

async function loadWarranty(): Promise<void> {
  try {
    warranty.value = await getWarranty(deviceId)
  } catch {
    warranty.value = null
  }
}

async function loadMaintenances(): Promise<void> {
  maintenanceState.value = 'loading'
  maintenanceErrorText.value = ''
  try {
    maintenances.value = await listByDevice(deviceId, 50)
    maintenanceState.value = maintenances.value.length === 0 ? 'empty' : 'success'
  } catch (err) {
    const appError = toAppError(err)
    maintenanceErrorText.value = appError.message
    maintenanceState.value = appError.code === 'FORBIDDEN' ? 'forbidden' : 'error'
  }
}

function gotoMaintenance(recordId: string): void {
  const query = recordId === '' ? `deviceId=${deviceId}` : `deviceId=${deviceId}&id=${recordId}`
  uni.navigateTo({ url: `/pages/devices/maintenance?${query}` })
}

async function loadTimeline(): Promise<void> {
  if (deviceId === '') return
  timelineState.value = 'loading'
  timelineErrorText.value = ''
  timelineItems.value = []
  timelinePage.value = 1
  timelineHasMore.value = false
  try {
    const result = await listDeviceTimeline({
      deviceId,
      page: 1,
      pageSize: TIMELINE_PAGE_SIZE,
    })
    timelineItems.value = result.items
    timelineHasMore.value = result.hasMore
    timelineState.value = result.items.length === 0 ? 'empty' : 'success'
  } catch (err) {
    const appError = toAppError(err)
    timelineErrorText.value = appError.message
    timelineState.value = appError.code === 'FORBIDDEN' ? 'forbidden' : 'error'
  }
}

async function loadMoreTimeline(): Promise<void> {
  if (timelineLoadingMore.value || !timelineHasMore.value) return
  timelineLoadingMore.value = true
  try {
    const nextPage = timelinePage.value + 1
    const result = await listDeviceTimeline({
      deviceId,
      page: nextPage,
      pageSize: TIMELINE_PAGE_SIZE,
    })
    const known = new Set(timelineItems.value.map((item) => item.id))
    timelineItems.value = [
      ...timelineItems.value,
      ...result.items.filter((item) => !known.has(item.id)),
    ]
    timelinePage.value = nextPage
    timelineHasMore.value = result.hasMore
  } catch {
    uni.showToast({ title: '加载更多失败，请重试', icon: 'none' })
  } finally {
    timelineLoadingMore.value = false
  }
}

onLoad((query) => {
  deviceId = query?.id ?? ''
})

// 页面显示即刷新：从编辑页返回（栈恢复）也能拿到最新数据
onShow(() => {
  if (deviceId !== '') {
    void load()
  }
})

function gotoEdit(): void {
  uni.navigateTo({ url: `/pages/devices/edit?id=${deviceId}` })
}

function askDelete(): void {
  confirmVisible.value = true
}

async function confirmDelete(): Promise<void> {
  if (deleting.value) return
  deleting.value = true
  try {
    await softDeleteDevice(deviceId)
    uni.showToast({ title: '已删除', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 500)
  } catch {
    uni.showToast({ title: '删除失败，请重试', icon: 'none' })
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped lang="scss">
.page {
  padding: $gf-space-md $gf-space-md $gf-space-xl;
}

.card {
  margin-bottom: $gf-space-md;
  padding: $gf-space-lg;
  background-color: $gf-bg-card;
  border-radius: $gf-radius-lg;
}

.hero-head {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.hero-name {
  font-size: 44rpx;
  font-weight: 700;
  color: $gf-text-1;
}

.status-badge {
  padding: 6rpx 16rpx;
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

.hero-sub {
  display: block;
  margin-top: $gf-space-xs;
  font-size: $gf-font-sm;
  color: $gf-text-3;
}

.card-title {
  display: block;
  margin-bottom: $gf-space-sm;
  font-size: $gf-font-md;
  font-weight: 600;
  color: $gf-text-1;
}

.row {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  padding: 10rpx 0;
}

.row-label {
  font-size: $gf-font-sm;
  color: $gf-text-3;
}

.row-value {
  font-size: $gf-font-sm;
  color: $gf-text-1;
  max-width: 60%;
  text-align: right;
  word-break: break-all;
}

.card-title-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: $gf-space-sm;
}

.card-title-row .card-title {
  margin-bottom: 0;
}

.add-maintenance {
  margin: 0;
  padding: 4rpx 16rpx;
  font-size: $gf-font-xs;
  color: $gf-color-primary;
  background-color: $gf-color-primary-weak;
  border-radius: $gf-radius-sm;
}

.subtotal {
  display: block;
  margin-bottom: $gf-space-xs;
  font-size: $gf-font-sm;
  color: $gf-text-1;
}

.maint-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: $gf-space-sm 0;
  border-bottom: 1rpx solid $gf-line;
}

.maint-row:last-child {
  border-bottom: none;
}

.maint-head {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: $gf-space-xs;
}

.maint-title {
  font-size: $gf-font-sm;
  color: $gf-text-1;
}

.maint-type {
  font-size: $gf-font-xs;
  color: $gf-text-3;
}

.maint-meta {
  font-size: $gf-font-xs;
  color: $gf-text-3;
}

.maint-cost {
  font-size: $gf-font-sm;
  color: $gf-text-1;
}

.warranty-badge.expiring {
  color: $gf-color-warning;
  background-color: #fff3e8;
}

.warranty-badge.expired {
  color: $gf-text-3;
  background-color: $gf-bg-page;
}

.placeholder {
  font-size: $gf-font-sm;
  color: $gf-text-3;
}

.timeline-more-button {
  width: 100%;
  margin-top: $gf-space-xs;
  font-size: $gf-font-sm;
  color: $gf-color-primary;
  background-color: $gf-color-primary-weak;
  border-radius: $gf-radius-md;
}

.timeline-more-button[disabled] {
  color: $gf-text-3;
  background-color: $gf-bg-page;
}

.actions button {
  width: 100%;
  margin-bottom: $gf-space-sm;
  font-size: $gf-font-md;
  border-radius: $gf-radius-md;
}

.edit-button {
  color: $gf-color-primary;
  background-color: $gf-color-primary-weak;
}

.danger-button {
  color: #ffffff;
  background-color: $gf-color-danger;
}

.danger-hint {
  display: block;
  margin-top: $gf-space-xs;
  font-size: $gf-font-xs;
  color: $gf-text-3;
  text-align: center;
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
</style>
