<template>
  <view class="page wot-text-text-main">
    <view class="hero">
      <view class="hero-orbit hero-orbit-outer" />
      <view class="hero-orbit hero-orbit-inner" />
      <view class="hero-topline">
        <view class="hero-brand"><view class="hero-brand-dot" /><text>GEARFLOW</text></view>
        <wd-icon name="apps" size="22px" color="#8bd4f7" />
      </view>
      <view class="hero-title"><text>你的设备，</text><text>井然有序。</text></view>
      <text class="hero-sub">设备资产与保修，一手掌握</text>
      <view class="hero-stats">
        <view class="hero-stat">
          <text class="hero-stat-value">{{ summaryReady ? deviceCount : '—' }}</text>
          <text class="hero-stat-label">设备总数</text>
        </view>
        <view class="hero-stat warning">
          <text class="hero-stat-value">{{ summaryReady ? expiringTotal : '—' }}</text>
          <text class="hero-stat-label">30 天内到期</text>
        </view>
        <view class="hero-stat muted">
          <text class="hero-stat-value">{{ summaryReady ? expiredTotal : '—' }}</text>
          <text class="hero-stat-label">已过保</text>
        </view>
      </view>
    </view>

    <view class="section-header">
      <view
        ><text class="section-kicker">YOUR ACTIVITY</text
        ><text class="section-heading">保修与动态</text></view
      >
      <text class="section-hint">设备的最新记录</text>
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
const summaryReady = computed(() => boardState.value === 'success' || boardState.value === 'empty')

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
  padding: 32rpx 32rpx calc(64rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.hero {
  position: relative;
  overflow: hidden;
  padding: 40rpx 36rpx 32rpx;
  margin-bottom: 48rpx;
  color: #fff;
  background: linear-gradient(135deg, #101f38 0%, #183a65 72%, #195279 100%);
  border-radius: 32rpx;
  box-shadow: 0 18rpx 42rpx rgba(18, 39, 70, 0.15);
}

.hero-orbit {
  position: absolute;
  right: -86rpx;
  top: 14rpx;
  width: 310rpx;
  height: 310rpx;
  border: 1rpx solid rgba(128, 205, 246, 0.16);
  border-radius: 50%;
  pointer-events: none;
}

.hero-orbit-inner {
  top: 64rpx;
  right: -36rpx;
  width: 210rpx;
  height: 210rpx;
  border-color: rgba(128, 205, 246, 0.11);
}

.hero-topline {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hero-brand {
  display: flex;
  align-items: center;
  gap: 12rpx;
  color: #a9cee8;
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 3rpx;
}

.hero-brand-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: #45d7d0;
}

.hero-title {
  position: relative;
  display: block;
  margin-top: 52rpx;
  font-size: 48rpx;
  font-weight: 700;
  line-height: 1.3;
  color: #fff;
}
.hero-title text {
  display: block;
}

.hero-sub {
  position: relative;
  display: block;
  margin-top: 16rpx;
  font-size: $gf-font-sm;
  line-height: 1.45;
  color: #b9d1e4;
}

.hero-stats {
  position: relative;
  display: flex;
  flex-direction: row;
  gap: 0;
  margin-top: 52rpx;
  padding: 28rpx 0 0;
  border-top: 1rpx solid rgba(202, 226, 243, 0.2);
}

.hero-stat {
  min-width: 0;
  flex: 1;
  padding: 0 24rpx;
}

.hero-stat:first-child {
  padding-left: 0;
}
.hero-stat + .hero-stat {
  border-left: 1rpx solid rgba(202, 226, 243, 0.18);
}

.hero-stat-value,
.hero-stat-label {
  display: block;
}

.hero-stat-value {
  font-size: 42rpx;
  font-weight: 700;
  line-height: 1.2;
  color: #fff;
}

.hero-stat-label {
  margin-top: 6rpx;
  font-size: $gf-font-xs;
  line-height: 1.35;
  color: #b9d1e4;
}

.section-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16rpx;
  margin: 0 4rpx 24rpx;
}

.section-kicker,
.section-heading {
  display: block;
}
.section-kicker {
  color: #74859b;
  font-size: 18rpx;
  font-weight: 700;
  letter-spacing: 2rpx;
}
.section-heading {
  margin-top: 8rpx;
  color: #16283e;
  font-size: 34rpx;
  font-weight: 700;
}
.section-hint {
  color: #718096;
  font-size: 22rpx;
  padding-bottom: 4rpx;
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
  border-left: 1rpx solid $gf-line;
}

.card-muted {
  border-left: 1rpx solid $gf-line;
}

.card-primary {
  border-left: 1rpx solid $gf-line;
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
