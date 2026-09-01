<template>
  <view class="page">
    <view class="hero">
      <text class="hero-title">保修与待办</text>
      <text class="hero-sub">{{ deviceCount }} 台设备 · {{ expiringCount }} 台保修临期</text>
    </view>

    <StatusView
      :state="boardState"
      :retry-loading="boardState === 'loading'"
      :empty-title="boardEmptyTitle"
      :empty-hint="boardEmptyHint"
      :error-text="boardErrorText"
      @retry="loadBoard"
    >
      <view v-if="expiring.length > 0" class="card">
        <text class="card-title">保修临期（30 天内）</text>
        <view
          v-for="item in expiring"
          :key="item.deviceId"
          class="board-row"
          @click="gotoDetail(item.deviceId)"
        >
          <view class="board-main">
            <text class="board-name">{{ item.deviceName }}</text>
            <text class="board-meta"
              >{{ item.endDate }} 到期 · 剩余 {{ item.remainingDays }} 天</text
            >
          </view>
          <text class="board-badge expiring">{{ item.remainingDays }} 天</text>
        </view>
      </view>

      <view v-if="expired.length > 0" class="card">
        <text class="card-title">已过保（90 天内）</text>
        <view
          v-for="item in expired"
          :key="item.deviceId"
          class="board-row"
          @click="gotoDetail(item.deviceId)"
        >
          <view class="board-main">
            <text class="board-name">{{ item.deviceName }}</text>
            <text class="board-meta"
              >{{ item.endDate }} 到期 · 已过 {{ -item.remainingDays }} 天</text
            >
          </view>
          <text class="board-badge expired">已过保</text>
        </view>
      </view>

      <view v-if="recentMaintenances.length > 0" class="card">
        <text class="card-title">最近维护</text>
        <view
          v-for="record in recentMaintenances"
          :key="record.id"
          class="board-row"
          @click="gotoDetail(record.deviceId)"
        >
          <view class="board-main">
            <text class="board-name">{{ record.title }}</text>
            <text class="board-meta"
              >{{ record.occurredAt
              }}{{
                deviceNameOf(record.deviceId) ? ' · ' + deviceNameOf(record.deviceId) : ''
              }}</text
            >
          </view>
          <text v-if="record.costCents !== null" class="board-cost"
            >¥{{ yuan(record.costCents) }}</text
          >
        </view>
      </view>
    </StatusView>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { ensureSession } from '@/services/auth'
import { listDevices } from '@/services/device'
import { listWarranties } from '@/services/warranty'
import { listRecent } from '@/services/maintenance'
import { computeWarranty } from '@/utils/warranty'
import { centsToYuan } from '@/utils/money'
import { toAppError } from '@/utils/error'
import StatusView from '@/components/StatusView.vue'
import type { DeviceDoc } from '@/types/device'
import type { MaintenanceDoc } from '@/types/maintenance'
import type { WarrantyDoc } from '@/types/maintenance'
import type { PageState } from '@/types/api/common'

interface ExpiringItem {
  deviceId: string
  deviceName: string
  endDate: string
  remainingDays: number
}

const boardState = ref<PageState>('idle')
const boardErrorText = ref('')
const deviceCount = ref(0)
const expiring = ref<ExpiringItem[]>([])
const expired = ref<ExpiringItem[]>([])
const recentMaintenances = ref<MaintenanceDoc[]>([])
const deviceNames = ref<Map<string, string>>(new Map())

const expiringCount = computed(() => expiring.value.length)
const boardEmptyTitle = computed(() =>
  expiring.value.length === 0 && expired.value.length === 0 ? '暂无保修临期事项' : '',
)
const boardEmptyHint = computed(() =>
  expiring.value.length === 0 && expired.value.length === 0
    ? '添加设备并填写保修日期后，这里会展示临期看板'
    : '',
)

function todayString(): string {
  const now = new Date()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}

function deviceNameOf(deviceId: string): string {
  return deviceNames.value.get(deviceId) ?? ''
}

function yuan(cents: number): string {
  return centsToYuan(cents)
}

function gotoDetail(deviceId: string): void {
  uni.navigateTo({ url: `/pages/devices/detail?id=${deviceId}` })
}

async function loadBoard(): Promise<void> {
  boardState.value = 'loading'
  boardErrorText.value = ''
  try {
    await ensureSession()
    const today = todayString()
    const [devices, warranties, maintenances] = await Promise.all([
      listDevices({ sortBy: 'createdAt', sortOrder: 'desc', page: 1, pageSize: 100 }),
      listWarranties(100),
      listRecent(5),
    ])

    const liveDevices = devices.items.filter((d: DeviceDoc) => d.deletedAt === null)
    deviceCount.value = liveDevices.length
    deviceNames.value = new Map(liveDevices.map((d) => [d.id, d.name]))
    const deviceIdSet = new Set(liveDevices.map((d) => d.id))

    const items: ExpiringItem[] = []
    const expiredItems: ExpiringItem[] = []
    for (const warranty of warranties as WarrantyDoc[]) {
      if (!deviceIdSet.has(warranty.deviceId)) continue
      const state = computeWarranty(warranty.endDate, today)
      const device = liveDevices.find((d) => d.id === warranty.deviceId)
      const item: ExpiringItem = {
        deviceId: warranty.deviceId,
        deviceName: device?.name ?? '未知设备',
        endDate: warranty.endDate,
        remainingDays: state.remainingDays ?? 0,
      }
      if (state.status === 'EXPIRING') items.push(item)
      if (
        state.status === 'EXPIRED' &&
        state.remainingDays !== null &&
        state.remainingDays >= -90
      ) {
        expiredItems.push(item)
      }
    }
    items.sort((a, b) => a.remainingDays - b.remainingDays)
    expiredItems.sort((a, b) => b.remainingDays - a.remainingDays)

    expiring.value = items
    expired.value = expiredItems
    recentMaintenances.value = maintenances.filter((record) => deviceIdSet.has(record.deviceId))
    boardState.value =
      expiring.value.length === 0 &&
      expired.value.length === 0 &&
      recentMaintenances.value.length === 0
        ? 'empty'
        : 'success'
  } catch (err) {
    const appError = toAppError(err)
    boardErrorText.value = appError.message
    boardState.value = appError.code === 'FORBIDDEN' ? 'forbidden' : 'error'
  }
}

onShow(() => {
  // 首次使用引导（PRD 4.1）：未完成引导时进入 onboarding
  if (uni.getStorageSync(ONBOARDED_KEY) !== '1') {
    uni.reLaunch({ url: '/pages/onboarding/index' })
    return
  }
  void loadBoard()
})
</script>

<script lang="ts">
const ONBOARDED_KEY = 'gf_onboarded'
export default {}
</script>

<style scoped lang="scss">
.page {
  padding: $gf-space-lg $gf-space-md $gf-space-xl;
}

.hero {
  margin-bottom: $gf-space-md;
}

.hero-title {
  font-size: $gf-font-xl;
  font-weight: 600;
  color: $gf-text-1;
}

.hero-sub {
  display: block;
  margin-top: $gf-space-xs;
  font-size: $gf-font-sm;
  color: $gf-text-3;
}

.card {
  margin-bottom: $gf-space-md;
  padding: $gf-space-md $gf-space-lg;
  background-color: $gf-bg-card;
  border-radius: $gf-radius-lg;
}

.card-title {
  display: block;
  margin-bottom: $gf-space-xs;
  font-size: $gf-font-md;
  font-weight: 600;
  color: $gf-text-1;
}

.board-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: $gf-space-sm 0;
  border-bottom: 1rpx solid $gf-line;
}

.board-row:last-child {
  border-bottom: none;
}

.board-name {
  font-size: $gf-font-sm;
  color: $gf-text-1;
}

.board-meta {
  display: block;
  margin-top: 4rpx;
  font-size: $gf-font-xs;
  color: $gf-text-3;
}

.board-badge {
  padding: 4rpx 12rpx;
  font-size: $gf-font-xs;
  border-radius: $gf-radius-sm;
}

.board-badge.expiring {
  color: $gf-color-warning;
  background-color: #fff3e8;
}

.board-badge.expired {
  color: $gf-text-3;
  background-color: $gf-bg-page;
}

.board-cost {
  font-size: $gf-font-sm;
  color: $gf-text-1;
}
</style>
