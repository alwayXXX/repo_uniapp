<template>
  <view class="page">
    <view class="hero">
      <text class="hero-kicker">GearFlow / 概览</text>
      <text class="hero-title">保修与待办</text>
      <text class="hero-sub">{{ deviceCount }} 台设备 · {{ expiringTotal }} 台保修临期</text>
      <view class="hero-stats">
        <view class="hero-stat">
          <text class="hero-stat-value">{{ deviceCount }}</text>
          <text class="hero-stat-label">设备总数</text>
        </view>
        <view class="hero-stat warning">
          <text class="hero-stat-value">{{ expiringTotal }}</text>
          <text class="hero-stat-label">30 天内到期</text>
        </view>
        <view class="hero-stat muted">
          <text class="hero-stat-value">{{ expiredTotal }}</text>
          <text class="hero-stat-label">已过保</text>
        </view>
      </view>
    </view>

    <StatusView
      :state="boardState"
      :retry-loading="boardState === 'loading'"
      :empty-title="boardEmptyTitle"
      :empty-hint="boardEmptyHint"
      :error-text="boardErrorText"
      @retry="loadBoard"
    >
      <view v-if="expiring.length > 0" class="card card-warning">
        <text class="card-title">保修临期（30 天内 · {{ expiringTotal }} 台）</text>
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

      <view v-if="expired.length > 0" class="card card-muted">
        <text class="card-title">已过保（90 天内 · {{ expiredTotal }} 台）</text>
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

      <view v-if="recentMaintenances.length > 0" class="card card-primary">
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
              >{{ record.occurredAt }}{{ record.deviceName ? ' · ' + record.deviceName : '' }}</text
            >
          </view>
          <text v-if="record.costCents !== null" class="board-cost">
            {{ formatMoney(record.costCents, record.currency) }}
          </text>
        </view>
      </view>
    </StatusView>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getHomeDashboard } from '@/services/dashboard'
import { requireCurrentConsent } from '@/services/consent'
import { formatMoney } from '@/utils/money'
import { toAppError } from '@/utils/error'
import StatusView from '@/components/StatusView.vue'
import type { DashboardMaintenanceItem, DashboardWarrantyItem } from '@/services/dashboard'
import type { PageState } from '@/types/api/common'

const boardState = ref<PageState>('idle')
const boardErrorText = ref('')
const deviceCount = ref(0)
const expiringTotal = ref(0)
const expiredTotal = ref(0)
const expiring = ref<DashboardWarrantyItem[]>([])
const expired = ref<DashboardWarrantyItem[]>([])
const recentMaintenances = ref<DashboardMaintenanceItem[]>([])

const boardEmptyTitle = computed(() =>
  expiring.value.length === 0 && expired.value.length === 0 ? '暂无保修临期事项' : '',
)
const boardEmptyHint = computed(() =>
  expiring.value.length === 0 && expired.value.length === 0
    ? '添加设备并填写保修日期后，这里会展示临期看板'
    : '',
)

function gotoDetail(deviceId: string): void {
  uni.navigateTo({ url: `/pages/devices/detail?id=${deviceId}` })
}

async function loadBoard(): Promise<void> {
  boardState.value = 'loading'
  boardErrorText.value = ''
  try {
    const dashboard = await getHomeDashboard()
    deviceCount.value = dashboard.deviceCount
    expiringTotal.value = dashboard.expiringTotal
    expiredTotal.value = dashboard.expiredTotal
    expiring.value = dashboard.expiring
    expired.value = dashboard.expired
    recentMaintenances.value = dashboard.recentMaintenances
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
  if (!requireCurrentConsent()) return
  void loadBoard()
})
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  padding: 24rpx $gf-space-md calc(64rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.hero {
  padding: 8rpx 8rpx 4rpx;
  margin-bottom: $gf-space-md;
}

.hero-kicker {
  display: block;
  font-size: $gf-font-xs;
  font-weight: 600;
  color: $gf-color-primary;
}

.hero-title {
  display: block;
  margin-top: 8rpx;
  font-size: $gf-font-xl;
  font-weight: 700;
  line-height: 1.25;
  color: $gf-text-1;
}

.hero-sub {
  display: block;
  margin-top: $gf-space-xs;
  font-size: $gf-font-sm;
  line-height: 1.45;
  color: $gf-text-3;
}

.hero-stats {
  display: flex;
  flex-direction: row;
  gap: $gf-space-sm;
  margin-top: $gf-space-md;
}

.hero-stat {
  min-width: 0;
  flex: 1;
  padding: 16rpx;
  background-color: $gf-bg-card;
  border: 1rpx solid $gf-line;
  border-top: 5rpx solid $gf-color-primary;
  border-radius: $gf-radius-md;
  box-shadow: $gf-shadow-sm;
}

.hero-stat.warning {
  border-top-color: $gf-color-warning;
}

.hero-stat.muted {
  border-top-color: $gf-text-4;
}

.hero-stat-value,
.hero-stat-label {
  display: block;
}

.hero-stat-value {
  font-size: $gf-font-lg;
  font-weight: 700;
  line-height: 1.2;
  color: $gf-text-1;
}

.hero-stat-label {
  margin-top: 6rpx;
  font-size: 20rpx;
  line-height: 1.35;
  color: $gf-text-3;
}

.card {
  margin-bottom: $gf-space-md;
  padding: $gf-space-md $gf-space-lg;
  background-color: $gf-bg-card;
  border-radius: $gf-radius-lg;
  border: 1rpx solid $gf-line;
  box-shadow: $gf-shadow-sm;
  box-sizing: border-box;
}

.card-warning {
  border-left: 6rpx solid $gf-color-warning;
}

.card-muted {
  border-left: 6rpx solid $gf-text-4;
}

.card-primary {
  border-left: 6rpx solid $gf-color-primary;
}

.card-title {
  display: block;
  margin-bottom: $gf-space-xs;
  font-size: $gf-font-md;
  font-weight: 600;
  line-height: 1.4;
  color: $gf-text-1;
}

.board-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: $gf-space-sm;
  padding: $gf-space-sm 0;
  border-bottom: 1rpx solid $gf-line;
}

.board-main {
  min-width: 0;
  flex: 1;
}

.board-row:last-child {
  border-bottom: none;
}

.board-name {
  display: block;
  font-size: $gf-font-sm;
  line-height: 1.4;
  color: $gf-text-1;
  word-break: break-word;
}

.board-meta {
  display: block;
  margin-top: 4rpx;
  font-size: $gf-font-xs;
  line-height: 1.45;
  color: $gf-text-3;
  word-break: break-word;
}

.board-badge {
  flex-shrink: 0;
  min-height: 48rpx;
  padding: 0 12rpx;
  font-size: $gf-font-xs;
  line-height: 48rpx;
  border-radius: $gf-radius-sm;
}

.board-badge.expiring {
  color: $gf-color-warning;
  background-color: $gf-color-warning-weak;
}

.board-badge.expired {
  color: $gf-text-3;
  background-color: $gf-bg-page;
}

.board-cost {
  flex-shrink: 0;
  font-size: $gf-font-sm;
  line-height: 1.4;
  color: $gf-text-1;
  word-break: break-all;
}
</style>
