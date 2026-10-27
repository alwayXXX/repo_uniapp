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

        <view class="card warranty-section">
          <view class="card-title-row">
            <text class="card-title">保修信息</text>
            <text v-if="warrantyState" class="status-badge" :class="warrantyBadgeClass">
              {{ warrantyState.statusLabel }}
            </text>
          </view>
          <StatusView
            :state="warrantyLoadState"
            :error-text="warrantyErrorText"
            empty-title="未填写保修"
            @retry="loadWarranty"
          >
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
          </StatusView>
        </view>

        <view class="card">
          <view class="card-title-row">
            <text class="card-title">维护记录</text>
            <view class="maintenance-actions">
              <button
                class="add-maintenance"
                :disabled="exportingMaintenance || maintenanceState !== 'success'"
                @click="exportMaintenanceCsv"
              >
                导出
              </button>
              <button class="add-maintenance" @click="gotoMaintenance('')">+ 添加</button>
            </view>
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
              v-for="record in visibleMaintenances"
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
            <button
              v-if="visibleMaintenances.length < maintenances.length"
              class="timeline-more-button"
              @click="maintenanceVisibleCount += 20"
            >
              加载更多
            </button>
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

        <view v-if="device.disposalDate" class="card">
          <text class="card-title">处置记录</text>
          <view class="row"
            ><text class="row-label">日期</text
            ><text class="row-value">{{ device.disposalDate }}</text></view
          >
          <view class="row"
            ><text class="row-label">收入</text
            ><text class="row-value">{{
              device.disposalPriceCents == null
                ? '未填写'
                : formatMoney(device.disposalPriceCents, device.currency)
            }}</text></view
          >
          <view class="row"
            ><text class="row-label">说明</text
            ><text class="row-value">{{ device.disposalNotes || '未填写' }}</text></view
          >
        </view>
        <view class="card actions">
          <text class="card-title">设备工具</text>
          <button class="edit-button" @click="openFeature('attachments')">照片与发票</button>
          <button class="edit-button" @click="openFeature('reminders')">保修到期提醒</button>
          <button class="edit-button" @click="openFeature('dispose')">出售 / 报废记录</button>
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
import { computed, onScopeDispose, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { getCategoryName } from '@/services/category'
import { getDevice, softDeleteDevice } from '@/services/device'
import { listDeviceTimeline } from '@/services/timeline'
import { listAllByDevice } from '@/services/maintenance'
import { getWarranty } from '@/services/warranty'
import { ensureSession } from '@/services/auth'
import { requireCurrentConsent } from '@/services/consent'
import { clientRevision } from '@/services/client-state'
import { formatMoney } from '@/utils/money'
import { computeWarranty, WARRANTY_STATUS_LABELS } from '@/utils/warranty'
import { toAppError } from '@/utils/error'
import { buildMaintenanceCsv, csvFileName, saveAndShareCsv } from '@/services/export'
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
function openFeature(page: 'attachments' | 'reminders' | 'dispose'): void {
  if (!device.value || !requireCurrentConsent()) return
  uni.navigateTo({ url: `/pages/devices/${page}?deviceId=${encodeURIComponent(device.value.id)}` })
}
const loadState = ref<PageState>('loading')
const errorText = ref('')
const deleting = ref(false)
const confirmVisible = ref(false)
const warranty = ref<WarrantyDoc | null>(null)
const warrantyLoadState = ref<PageState>('loading')
const warrantyErrorText = ref('')

const TIMELINE_PAGE_SIZE = 20
const timelineItems = ref<DeviceTimelineEvent[]>([])
const timelineState = ref<PageState>('idle')
const timelineErrorText = ref('')
const timelinePage = ref(1)
const timelineHasMore = ref(false)
const timelineLoadingMore = ref(false)

const maintenances = ref<MaintenanceDoc[]>([])
const maintenanceVisibleCount = ref(20)
const visibleMaintenances = computed(() =>
  maintenances.value.slice(0, maintenanceVisibleCount.value),
)
const exportingMaintenance = ref(false)

/** 导出当前设备的维护记录 CSV */
async function exportMaintenanceCsv(): Promise<void> {
  if (
    !device.value ||
    exportingMaintenance.value ||
    loadState.value !== 'success' ||
    maintenanceState.value !== 'success' ||
    !requireCurrentConsent()
  )
    return
  if (maintenances.value.length === 0) {
    uni.showToast({ title: '暂无维护记录可导出', icon: 'none' })
    return
  }
  exportingMaintenance.value = true
  const revision = clientRevision()
  try {
    const csv = buildMaintenanceCsv(device.value, maintenances.value, (id) =>
      id ? getCategoryName(id) : '',
    )
    await saveAndShareCsv(csvFileName(`gearflow_${device.value.name}_维护记录`), csv, revision)
  } catch (err) {
    uni.showToast({ title: toAppError(err).message, icon: 'none' })
  } finally {
    exportingMaintenance.value = false
  }
}
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
  if (maintenanceState.value !== 'success') return null
  const withCost = maintenances.value.filter((r) => r.costCents !== null)
  if (withCost.length === 0) return null
  return withCost.reduce((sum, r) => sum + (r.costCents ?? 0), 0)
})

function typeLabel(type: MaintenanceType): string {
  return MAINTENANCE_TYPE_LABELS[type]
}

let deviceId = ''
let loadVersion = 0
let warrantyVersion = 0
let maintenanceVersion = 0
let timelineVersion = 0

function invalidateLoads(): void {
  loadVersion += 1
  warrantyVersion += 1
  maintenanceVersion += 1
  timelineVersion += 1
}

onScopeDispose(invalidateLoads)

async function load(): Promise<void> {
  if (!requireCurrentConsent()) return
  invalidateLoads()
  const version = loadVersion
  const revision = clientRevision()
  loadState.value = 'loading'
  errorText.value = ''
  device.value = null
  warranty.value = null
  warrantyLoadState.value = 'loading'
  warrantyErrorText.value = ''
  maintenances.value = []
  maintenanceState.value = 'loading'
  maintenanceErrorText.value = ''
  maintenanceVisibleCount.value = 20
  timelineItems.value = []
  timelineState.value = 'loading'
  timelineErrorText.value = ''
  timelineHasMore.value = false
  timelineLoadingMore.value = false
  try {
    await ensureSession()
    if (version !== loadVersion || revision !== clientRevision()) return
    const result = await getDevice(deviceId)
    if (version !== loadVersion || revision !== clientRevision()) return
    if (!result) {
      // 云函数下他人的设备与不存在的设备同样不可见（docs/PRD 4.3 异常态）
      uni.showToast({ title: '设备不存在或已被删除', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 600)
      return
    }
    device.value = result
    loadState.value = 'success'
    await Promise.all([loadTimeline(), loadWarranty(), loadMaintenances()])
  } catch (err) {
    if (version !== loadVersion || revision !== clientRevision()) return
    const appError = toAppError(err)
    errorText.value = appError.message
    loadState.value = appError.code === 'FORBIDDEN' ? 'forbidden' : 'error'
  }
}

async function loadWarranty(): Promise<void> {
  const version = ++warrantyVersion
  const revision = clientRevision()
  warrantyLoadState.value = 'loading'
  warrantyErrorText.value = ''
  warranty.value = null
  try {
    const result = await getWarranty(deviceId)
    if (version !== warrantyVersion || revision !== clientRevision()) return
    warranty.value = result
    warrantyLoadState.value = result ? 'success' : 'empty'
  } catch (err) {
    if (version !== warrantyVersion || revision !== clientRevision()) return
    const error = toAppError(err)
    warrantyErrorText.value = error.message
    warrantyLoadState.value = error.code === 'FORBIDDEN' ? 'forbidden' : 'error'
  }
}

async function loadMaintenances(): Promise<void> {
  const version = ++maintenanceVersion
  const revision = clientRevision()
  maintenanceState.value = 'loading'
  maintenanceErrorText.value = ''
  maintenances.value = []
  maintenanceVisibleCount.value = 20
  try {
    const records = await listAllByDevice(deviceId)
    if (version !== maintenanceVersion || revision !== clientRevision()) return
    maintenances.value = records
    maintenanceState.value = maintenances.value.length === 0 ? 'empty' : 'success'
  } catch (err) {
    if (version !== maintenanceVersion || revision !== clientRevision()) return
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
  const version = ++timelineVersion
  const revision = clientRevision()
  timelineState.value = 'loading'
  timelineErrorText.value = ''
  timelineItems.value = []
  timelinePage.value = 1
  timelineHasMore.value = false
  timelineLoadingMore.value = false
  try {
    const result = await listDeviceTimeline({
      deviceId,
      page: 1,
      pageSize: TIMELINE_PAGE_SIZE,
    })
    if (version !== timelineVersion || revision !== clientRevision()) return
    timelineItems.value = result.items
    timelineHasMore.value = result.hasMore
    timelineState.value = result.items.length === 0 ? 'empty' : 'success'
  } catch (err) {
    if (version !== timelineVersion || revision !== clientRevision()) return
    const appError = toAppError(err)
    timelineErrorText.value = appError.message
    timelineState.value = appError.code === 'FORBIDDEN' ? 'forbidden' : 'error'
  }
}

async function loadMoreTimeline(): Promise<void> {
  if (timelineLoadingMore.value || !timelineHasMore.value) return
  timelineLoadingMore.value = true
  const version = timelineVersion
  const revision = clientRevision()
  try {
    const nextPage = timelinePage.value + 1
    const result = await listDeviceTimeline({
      deviceId,
      page: nextPage,
      pageSize: TIMELINE_PAGE_SIZE,
    })
    if (version !== timelineVersion || revision !== clientRevision()) return
    const known = new Set(timelineItems.value.map((item) => item.id))
    timelineItems.value = [
      ...timelineItems.value,
      ...result.items.filter((item) => !known.has(item.id)),
    ]
    timelinePage.value = nextPage
    timelineHasMore.value = result.hasMore
  } catch {
    if (version === timelineVersion && revision === clientRevision()) {
      uni.showToast({ title: '加载更多失败，请重试', icon: 'none' })
    }
  } finally {
    if (version === timelineVersion && revision === clientRevision()) {
      timelineLoadingMore.value = false
    }
  }
}

onLoad((query) => {
  deviceId = query?.id ?? ''
})

// 页面显示即刷新：从编辑页返回（栈恢复）也能拿到最新数据
onShow(() => {
  if (!requireCurrentConsent()) return
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
  min-height: 100vh;
  padding: 24rpx $gf-space-md calc(64rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.card {
  margin-bottom: $gf-space-md;
  padding: $gf-space-lg;
  background-color: $gf-bg-card;
  border: 1rpx solid $gf-line;
  border-radius: $gf-radius-lg;
  box-shadow: $gf-shadow-sm;
  box-sizing: border-box;
}

.hero {
  border-top: 6rpx solid $gf-color-primary;
}

.hero-head {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  gap: $gf-space-sm;
}

.hero-name {
  min-width: 0;
  flex: 1;
  font-size: 44rpx;
  font-weight: 700;
  line-height: 1.25;
  color: $gf-text-1;
  word-break: break-word;
}

.status-badge {
  flex-shrink: 0;
  min-height: 48rpx;
  padding: 0 14rpx;
  font-size: $gf-font-xs;
  line-height: 48rpx;
  border-radius: $gf-radius-sm;
  color: $gf-color-primary;
  background-color: $gf-color-primary-weak;
  white-space: nowrap;
}

.status-badge.in_use {
  color: $gf-color-success;
  background-color: $gf-color-success-weak;
}

.status-badge.idle,
.status-badge.expiring {
  color: $gf-color-warning;
  background-color: $gf-color-warning-weak;
}

.status-badge.in_warranty {
  color: $gf-color-success;
  background-color: $gf-color-success-weak;
}

.status-badge.sold,
.status-badge.discarded,
.status-badge.expired,
.status-badge.unknown {
  color: $gf-text-3;
  background-color: $gf-bg-subtle;
}

.hero-sub {
  display: block;
  margin-top: $gf-space-xs;
  font-size: $gf-font-sm;
  line-height: 1.45;
  color: $gf-text-3;
  word-break: break-word;
}

.card-title {
  display: block;
  margin-bottom: $gf-space-sm;
  font-size: $gf-font-md;
  font-weight: 600;
  line-height: 1.35;
  color: $gf-text-1;
}

.row {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: $gf-space-md;
  padding: 14rpx 0;
  border-top: 1rpx solid $gf-line;
}

.row:first-of-type {
  border-top: 0;
}

.row-label {
  flex: 0 0 144rpx;
  font-size: $gf-font-sm;
  line-height: 1.45;
  color: $gf-text-3;
}

.row-value {
  min-width: 0;
  flex: 1;
  font-size: $gf-font-sm;
  line-height: 1.45;
  color: $gf-text-1;
  text-align: right;
  word-break: break-word;
}

.card-title-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: $gf-space-sm;
  margin-bottom: $gf-space-sm;
}

.card-title-row .card-title {
  min-width: 0;
  flex: 1;
  margin-bottom: 0;
}

.maintenance-actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.add-maintenance {
  flex-shrink: 0;
  height: 64rpx;
  min-height: 64rpx;
  margin: 0;
  padding: 0 16rpx;
  font-size: $gf-font-xs;
  font-weight: 600;
  line-height: 64rpx;
  color: $gf-color-primary;
  background-color: $gf-color-primary-weak;
  border-radius: $gf-radius-sm;
}

.subtotal {
  display: block;
  margin-bottom: $gf-space-xs;
  font-size: $gf-font-sm;
  line-height: 1.4;
  color: $gf-text-1;
  word-break: break-all;
}

.maint-row {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  gap: $gf-space-sm;
  padding: $gf-space-sm 0;
  border-top: 1rpx solid $gf-line;
}

.maint-row:first-child {
  border-top: 0;
}

.maint-main {
  min-width: 0;
  flex: 1;
}

.maint-head {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 4rpx $gf-space-xs;
}

.maint-title {
  min-width: 0;
  font-size: $gf-font-sm;
  line-height: 1.4;
  color: $gf-text-1;
  word-break: break-word;
}

.maint-type {
  flex-shrink: 0;
  font-size: $gf-font-xs;
  line-height: 1.4;
  color: $gf-text-3;
}

.maint-meta {
  display: block;
  margin-top: 4rpx;
  font-size: $gf-font-xs;
  line-height: 1.4;
  color: $gf-text-3;
  word-break: break-word;
}

.maint-cost {
  flex-shrink: 0;
  max-width: 42%;
  font-size: $gf-font-sm;
  line-height: 1.4;
  color: $gf-text-1;
  text-align: right;
  word-break: break-all;
}

.placeholder {
  display: block;
  font-size: $gf-font-sm;
  line-height: 1.55;
  color: $gf-text-3;
}

.timeline-more-button {
  width: 100%;
  height: 80rpx;
  min-height: 80rpx;
  margin-top: $gf-space-xs;
  padding: 0 $gf-space-md;
  font-size: $gf-font-sm;
  line-height: 80rpx;
  color: $gf-color-primary;
  background-color: $gf-color-primary-weak;
  border-radius: $gf-control-radius;
}

.timeline-more-button[disabled] {
  color: $gf-text-3;
  background-color: $gf-bg-subtle;
}

.actions button {
  width: 100%;
  height: 84rpx;
  min-height: 84rpx;
  margin-bottom: $gf-space-sm;
  padding: 0 $gf-space-md;
  font-size: $gf-font-md;
  line-height: 84rpx;
  border-radius: $gf-control-radius;
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
  line-height: 1.45;
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
  padding: 32rpx;
  background-color: rgba(32, 33, 36, 0.45);
  box-sizing: border-box;
}

.confirm-card {
  width: 100%;
  max-width: 640rpx;
  padding: $gf-space-lg;
  background-color: $gf-bg-card;
  border-radius: $gf-radius-lg;
  box-sizing: border-box;
}

.confirm-title {
  display: block;
  font-size: $gf-font-lg;
  font-weight: 600;
  line-height: 1.35;
  color: $gf-text-1;
}

.confirm-text {
  display: block;
  margin-top: $gf-space-sm;
  font-size: $gf-font-sm;
  line-height: 1.6;
  color: $gf-text-2;
  word-break: break-word;
}

.confirm-actions {
  display: flex;
  flex-direction: row;
  gap: $gf-space-sm;
  margin-top: $gf-space-lg;
}

.confirm-actions button {
  height: 80rpx;
  min-height: 80rpx;
  flex: 1;
  padding: 0 $gf-space-sm;
  font-size: $gf-font-md;
  line-height: 80rpx;
  border-radius: $gf-radius-md;
}

.cancel-button {
  color: $gf-text-2;
  background-color: $gf-bg-subtle;
}
</style>
