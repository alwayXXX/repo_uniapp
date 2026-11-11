<template>
  <view class="page wot-text-text-main">
    <view class="masthead">
      <text class="kicker">YOUR INSIGHTS</text>
      <view class="heading-row">
        <text class="page-title">资产概览</text>
        <text class="range-note">{{ selectedRange.label }}</text>
      </view>
      <view class="controls">
        <view class="control-column">
          <GearPicker
            mode="selector"
            :range="rangeLabels"
            :value="rangeIndex"
            @change="onRangeChange"
          >
            <view class="control-chip">
              <view class="control-copy">
                <text class="control-label">范围</text>
                <text class="control-value">{{ selectedRange.label }}</text>
              </view>
              <wd-icon name="arrow-down" size="14px" color="#77889c" />
            </view>
          </GearPicker>
        </view>
        <view class="control-column">
          <GearPicker
            mode="selector"
            :range="categoryLabels"
            :value="categoryIndex"
            @change="onCategoryChange"
          >
            <view class="control-chip">
              <view class="control-copy">
                <text class="control-label">分类</text>
                <text class="control-value">{{ categoryLabel }}</text>
              </view>
              <wd-icon name="arrow-down" size="14px" color="#77889c" />
            </view>
          </GearPicker>
        </view>
      </view>
    </view>

    <button class="annual-entry" @click="openAnnualReport">
      <view class="annual-icon"><wd-icon name="calendar-line" size="23px" color="#2468be" /></view>
      <view class="annual-copy">
        <text class="annual-title">年度设备报告</text>
        <text class="annual-subtitle">回看设备变化与年度支出</text>
      </view>
      <view class="annual-arrow"><wd-icon name="arrow-right" size="16px" color="#2468be" /></view>
    </button>
    <StatusView
      :state="pageState"
      :retry-loading="pageState === 'loading'"
      :error-text="errorText"
      empty-title="还没有可分析的数据"
      empty-hint="添加设备或维护记录后，这里会呈现资产与支出洞察"
      @retry="load"
    >
      <template #empty-action>
        <wd-button type="primary" class="primary-button" @click="gotoDevices">去添加设备</wd-button>
      </template>

      <template v-if="overview">
        <view class="asset-band">
          <view class="asset-orbit" />
          <view class="band-topline">
            <text class="band-label">当前资产</text>
            <text class="band-range">{{
              overview.currency === 'MIXED' ? '多币种' : overview.currency
            }}</text>
          </view>
          <text class="asset-value">{{
            formatMoney(overview.totalAssetCents, overview.currency) || '—'
          }}</text>
          <text class="band-note"
            >{{ overview.deviceCount }} 台设备 · {{ overview.activeDeviceCount }} 台在用或闲置</text
          >
        </view>

        <view class="metric-grid">
          <view class="metric-cell">
            <text class="metric-label">购买支出</text>
            <text class="metric-value">{{
              formatMoney(overview.purchaseSpendCents, overview.currency)
            }}</text>
            <text class="metric-note">按购买日期</text>
          </view>
          <view class="metric-cell metric-accent">
            <text class="metric-label">维护支出</text>
            <text class="metric-value">{{
              formatMoney(overview.maintenanceSpendCents, overview.currency)
            }}</text>
            <text class="metric-note">按维护发生日</text>
          </view>
        </view>

        <view class="section">
          <view class="section-heading">
            <text class="section-title">生命周期</text>
            <text class="section-caption">{{ overview.deviceCount }} 台设备</text>
          </view>
          <view
            v-for="item in overview.lifecycleDistribution"
            :key="item.status"
            class="distribution-row"
          >
            <view class="distribution-head">
              <text class="distribution-label">{{ item.label }}</text>
              <text class="distribution-value"
                >{{ item.deviceCount }} 台 ·
                {{ formatMoney(item.assetCents, overview.currency) }}</text
              >
            </view>
            <wd-progress
              :percentage="lifecyclePercent(item.deviceCount)"
              :color="lifecycleColor(item.status)"
              :duration="0"
              hide-text
              custom-style="--wot-progress-height: 12rpx; --wot-progress-bar-height: 12rpx; margin-top: 8rpx"
            />
          </view>
        </view>

        <view class="section">
          <view class="section-heading">
            <text class="section-title">分类资产</text>
            <text class="section-caption">按资产金额</text>
          </view>
          <view
            v-for="item in overview.categoryDistribution"
            :key="item.categoryId ?? 'uncategorized'"
            class="distribution-row category-row"
            @click="openDevices(item.categoryId)"
          >
            <view class="distribution-head">
              <text class="distribution-label">{{ item.categoryName }}</text>
              <text class="distribution-value"
                >{{ item.deviceCount }} 台 ·
                {{ formatMoney(item.assetCents, overview.currency) }}</text
              >
            </view>
            <wd-progress
              :percentage="categoryPercent(item)"
              color="#1a73e8"
              :duration="0"
              hide-text
              custom-style="--wot-progress-height: 12rpx; --wot-progress-bar-height: 12rpx; margin-top: 8rpx"
            />
          </view>
          <text v-if="overview.categoryDistribution.length === 0" class="section-empty"
            >暂无分类数据</text
          >
        </view>

        <view class="section warranty-section">
          <view class="section-heading">
            <text class="section-title">保修状态</text>
            <text class="section-caption">实时计算</text>
          </view>
          <view class="warranty-grid">
            <view class="warranty-cell">
              <text class="warranty-count in-warranty">{{
                overview.warrantySummary.inWarranty
              }}</text>
              <text class="warranty-label">保修中</text>
            </view>
            <view class="warranty-cell">
              <text class="warranty-count expiring">{{
                overview.warrantySummary.expiringIn30Days
              }}</text>
              <text class="warranty-label">30 天内到期</text>
            </view>
            <view class="warranty-cell">
              <text class="warranty-count expired">{{ overview.warrantySummary.expired }}</text>
              <text class="warranty-label">已过保</text>
            </view>
            <view class="warranty-cell">
              <text class="warranty-count unknown">{{ overview.warrantySummary.unknown }}</text>
              <text class="warranty-label">未填写</text>
            </view>
          </view>
        </view>
      </template>
    </StatusView>
  </view>
</template>

<script setup lang="ts">
import GearPicker from '@/components/GearPicker.vue'
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { ensureSession } from '@/services/auth'
import { requireCurrentConsent } from '@/services/consent'
import { getStatisticsOverview } from '@/services/stats'
import { listCategories } from '@/services/category'
import { formatMoney } from '@/utils/money'
import { getStatisticsDateRange, percentage, type StatisticsRangePreset } from '@/utils/statistics'
import { toAppError } from '@/utils/error'
import StatusView from '@/components/StatusView.vue'
import type { DeviceCategory } from '@/types/device'
import type { PageState } from '@/types/api/common'
import type { CategoryDistributionItem, StatisticsOverview } from '@/services/stats'

const RANGE_PRESETS: readonly StatisticsRangePreset[] = ['currentYear', 'previousYear', 'all']
const rangeLabels = ['今年', '去年', '全部时间']
function openAnnualReport(): void {
  uni.navigateTo({ url: '/pages/stats/annual' })
}

const pageState = ref<PageState>('idle')
const errorText = ref('')
const selectedPreset = ref<StatisticsRangePreset>('currentYear')
const selectedCategoryId = ref('')
const categories = ref<DeviceCategory[]>([])
const overview = ref<StatisticsOverview | null>(null)

const selectedRange = computed(() => getStatisticsDateRange(selectedPreset.value))
const rangeIndex = computed(() => Math.max(0, RANGE_PRESETS.indexOf(selectedPreset.value)))
const categoryLabels = computed(() => ['全部分类', ...categories.value.map((item) => item.name)])
const categoryIndex = computed(() =>
  selectedCategoryId.value
    ? categories.value.findIndex((item) => item.id === selectedCategoryId.value) + 1
    : 0,
)
const categoryLabel = computed(() => {
  if (selectedCategoryId.value === '') return '全部分类'
  return categories.value.find((item) => item.id === selectedCategoryId.value)?.name ?? '全部分类'
})

const lifecycleTotal = computed(
  () => overview.value?.lifecycleDistribution.reduce((sum, item) => sum + item.deviceCount, 0) ?? 0,
)
const categoryAssetTotal = computed(
  () => overview.value?.categoryDistribution.reduce((sum, item) => sum + item.assetCents, 0) ?? 0,
)
const categoryDeviceTotal = computed(
  () => overview.value?.categoryDistribution.reduce((sum, item) => sum + item.deviceCount, 0) ?? 0,
)

function lifecyclePercent(value: number): number {
  return percentage(value, lifecycleTotal.value)
}

function lifecycleColor(status: string): string {
  if (status === 'IN_USE') return '#188038'
  if (status === 'IDLE') return '#b06000'
  return '#bdc1c6'
}

function categoryPercent(item: CategoryDistributionItem): number {
  const base = categoryAssetTotal.value > 0 ? categoryAssetTotal.value : categoryDeviceTotal.value
  const value = categoryAssetTotal.value > 0 ? item.assetCents : item.deviceCount
  return percentage(value, base)
}

function gotoDevices(): void {
  uni.switchTab({ url: '/pages/devices/index' })
}

function openDevices(categoryId: string | null): void {
  if (categoryId) {
    uni.setStorageSync('gf_stats_category_id', categoryId)
  } else {
    uni.removeStorageSync('gf_stats_category_id')
  }
  gotoDevices()
}

async function loadCategories(): Promise<void> {
  try {
    categories.value = await listCategories()
  } catch {
    categories.value = []
  }
}

async function load(): Promise<void> {
  pageState.value = 'loading'
  errorText.value = ''
  try {
    await ensureSession()
    await loadCategories()
    const range = selectedRange.value
    overview.value = await getStatisticsOverview({
      startDate: range.startDate,
      endDate: range.endDate,
      categoryId: selectedCategoryId.value || undefined,
    })
    const hasData =
      overview.value.deviceCount > 0 ||
      overview.value.purchaseSpendCents > 0 ||
      overview.value.maintenanceSpendCents > 0
    pageState.value = hasData ? 'success' : 'empty'
  } catch (err) {
    const appError = toAppError(err)
    if (appError.code === 'DATE_RANGE_INVALID' && selectedPreset.value !== 'currentYear') {
      selectedPreset.value = 'currentYear'
      void load()
      return
    }
    overview.value = null
    errorText.value = appError.message
    pageState.value = appError.code === 'FORBIDDEN' ? 'forbidden' : 'error'
  }
}

function onRangeChange(event: { detail: { value: string | number } }): void {
  const index = Number(event.detail.value)
  const preset = RANGE_PRESETS[index]
  if (!preset || preset === selectedPreset.value) return
  selectedPreset.value = preset
  void load()
}

function onCategoryChange(event: { detail: { value: string | number } }): void {
  const index = Number(event.detail.value)
  if (Number.isNaN(index) || index <= 0) {
    selectedCategoryId.value = ''
  } else {
    selectedCategoryId.value = categories.value[index - 1]?.id ?? ''
  }
  void load()
}

onShow(() => {
  if (!requireCurrentConsent()) return
  void load()
})
</script>

<style scoped lang="scss">
.annual-entry {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 132rpx;
  margin: 8rpx 0 28rpx;
  padding: 24rpx;
  gap: 20rpx;
  color: #173451;
  background: linear-gradient(110deg, #eaf3ff, #f4f9ff);
  border: 1rpx solid #dceaff;
  border-radius: 24rpx;
  text-align: left;
  line-height: normal;
}
.annual-icon,
.annual-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.annual-icon {
  width: 76rpx;
  height: 76rpx;
  border-radius: 20rpx;
  background: #fff;
}
.annual-copy {
  flex: 1;
  min-width: 0;
}
.annual-title,
.annual-subtitle {
  display: block;
}
.annual-title {
  color: #173451;
  font-size: 29rpx;
  font-weight: 700;
  line-height: 1.4;
}
.annual-subtitle {
  margin-top: 6rpx;
  color: #5f7287;
  font-size: 22rpx;
  line-height: 1.4;
}
.annual-arrow {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.8);
}
.page {
  min-height: 100vh;
  padding: 40rpx 32rpx calc(64rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.masthead {
  padding: 0;
  margin-bottom: $gf-space-md;
}

.kicker {
  display: block;
  font-size: $gf-font-xs;
  font-weight: 600;
  color: #587c9f;
  letter-spacing: 2rpx;
}

.heading-row {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
  gap: $gf-space-sm;
  margin-top: 16rpx;
}

.page-title {
  min-width: 0;
  flex: 1;
  font-size: 48rpx;
  font-weight: 700;
  line-height: 1.25;
  color: $gf-text-1;
}

.range-note {
  flex-shrink: 0;
  font-size: $gf-font-sm;
  line-height: 1.4;
  color: $gf-text-3;
}

.controls {
  display: flex;
  flex-direction: row;
  gap: $gf-space-sm;
  margin-top: $gf-space-md;
}

.control-column {
  min-width: 0;
  flex: 1;
}

.control-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  width: 100%;
  min-width: 0;
  min-height: 48px;
  padding: 12rpx $gf-space-md;
  background-color: $gf-bg-card;
  border: 1rpx solid $gf-line;
  border-radius: 16rpx;
  box-shadow: $gf-shadow-sm;
  box-sizing: border-box;
}

.control-copy {
  min-width: 0;
  flex: 1;
}

.control-label,
.control-value {
  display: block;
}

.control-label {
  font-size: $gf-font-xs;
  line-height: 1.25;
  color: $gf-text-3;
}

.control-value {
  min-width: 0;
  margin-top: 4rpx;
  font-size: $gf-font-sm;
  line-height: 1.35;
  color: $gf-text-1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.asset-band {
  position: relative;
  overflow: hidden;
  margin-bottom: 24rpx;
  padding: 40rpx;
  background: linear-gradient(135deg, #101f38, #1b436b);
  border-radius: 30rpx;
  box-shadow: 0 16rpx 38rpx rgba(18, 39, 70, 0.14);
  box-sizing: border-box;
}

.asset-orbit {
  position: absolute;
  right: -60rpx;
  bottom: -155rpx;
  width: 310rpx;
  height: 310rpx;
  border: 1rpx solid rgba(128, 205, 246, 0.18);
  border-radius: 50%;
  pointer-events: none;
}

.band-topline,
.section-heading,
.distribution-head {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: $gf-space-sm;
}

.distribution-head {
  align-items: flex-start;
}

.band-label,
.band-range,
.band-note {
  color: rgba(255, 255, 255, 0.78);
}

.band-label {
  font-size: $gf-font-sm;
}

.band-range {
  flex-shrink: 0;
  font-size: $gf-font-xs;
}

.asset-value {
  display: block;
  margin-top: 28rpx;
  font-size: 54rpx;
  font-weight: 700;
  line-height: 1.2;
  color: #ffffff;
  word-break: break-all;
}

.band-note {
  display: block;
  margin-top: 16rpx;
  font-size: $gf-font-xs;
  line-height: 1.4;
}

.metric-grid {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: $gf-space-sm;
  margin-bottom: 32rpx;
}

.metric-cell {
  flex: 1 1 260rpx;
  min-width: 260rpx;
  padding: 32rpx;
  background-color: $gf-bg-card;
  border: 1rpx solid $gf-line;
  border-radius: $gf-radius-lg;
  box-shadow: $gf-shadow-sm;
  box-sizing: border-box;
}

.metric-label,
.metric-note {
  display: block;
}

.metric-label {
  font-size: $gf-font-sm;
  line-height: 1.35;
  color: $gf-text-2;
}

.metric-value {
  display: block;
  min-width: 0;
  margin-top: $gf-space-sm;
  font-size: $gf-font-lg;
  font-weight: 600;
  line-height: 1.3;
  color: $gf-text-1;
  word-break: break-all;
}

.metric-note {
  margin-top: $gf-space-xs;
  font-size: $gf-font-xs;
  line-height: 1.35;
  color: $gf-text-3;
}

.section {
  margin-top: 24rpx;
  padding: 32rpx;
  background-color: $gf-bg-card;
  border: 1rpx solid $gf-line;
  border-radius: 28rpx;
  box-shadow: $gf-shadow-sm;
  box-sizing: border-box;
}

.section-title {
  min-width: 0;
  font-size: $gf-font-md;
  font-weight: 600;
  line-height: 1.35;
  color: $gf-text-1;
}

.section-caption {
  flex-shrink: 0;
  font-size: $gf-font-xs;
  line-height: 1.35;
  color: $gf-text-3;
}

.distribution-row {
  margin-top: $gf-space-md;
}

.category-row {
  padding-bottom: $gf-space-xs;
}

.distribution-label,
.distribution-value {
  min-width: 0;
  font-size: $gf-font-sm;
  line-height: 1.4;
}

.distribution-label {
  flex: 1;
  color: $gf-text-2;
  word-break: break-word;
}

.distribution-value {
  flex-shrink: 0;
  max-width: 68%;
  color: $gf-text-1;
  text-align: right;
  word-break: break-all;
}

.section-empty {
  display: block;
  margin-top: $gf-space-md;
  font-size: $gf-font-sm;
  line-height: 1.4;
  color: $gf-text-3;
}

.warranty-grid {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  margin-top: $gf-space-sm;
}

.warranty-cell {
  width: 50%;
  padding: $gf-space-sm 0;
  box-sizing: border-box;
}

.warranty-count,
.warranty-label {
  display: block;
}

.warranty-count {
  font-size: $gf-font-lg;
  font-weight: 700;
  line-height: 1.25;
}

.warranty-count.in-warranty {
  color: $gf-color-success;
}

.warranty-count.expiring {
  color: $gf-color-warning;
}

.warranty-count.expired,
.warranty-count.unknown {
  color: $gf-text-3;
}

.warranty-label {
  margin-top: 4rpx;
  font-size: $gf-font-xs;
  line-height: 1.35;
  color: $gf-text-3;
}

.primary-button {
  width: 100%;
  height: 88rpx;
  min-height: 88rpx;
  margin-top: $gf-space-sm;
  padding: 0 $gf-space-lg;
  font-size: $gf-font-md;
  font-weight: 600;
  line-height: 88rpx;
  color: #ffffff;
  background-color: $gf-color-primary;
  border-radius: $gf-control-radius;
}
</style>
