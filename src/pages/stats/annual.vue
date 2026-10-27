<template>
  <view class="p11-page">
    <text class="eyebrow">GEARFLOW / 年度回顾</text>
    <text class="title">{{ year }} 年设备报告</text>
    <picker
      mode="date"
      fields="year"
      start="1970"
      :end="String(currentYear)"
      :value="String(year)"
      @change="changeYear"
    >
      <view class="card">选择年份 · {{ year }} 年 ›</view>
    </picker>
    <StatusView :state="state" :error-text="error" @retry="refresh">
      <template v-if="report">
        <view class="card"
          ><text>年度总支出</text
          ><text class="amount">{{ formatMoney(report.totalSpendCents) }}</text>
          <text class="hint">购买与维护支出合计，按发生日期计算；未填写金额的记录不计入合计</text>
          <view class="row"
            ><text>购入 {{ report.purchaseCount }} 台</text
            ><text>{{ formatMoney(report.purchaseCents) }}</text></view
          >
          <view class="row"
            ><text>维护 {{ report.maintenanceCount }} 次</text
            ><text>{{ formatMoney(report.maintenanceCents) }}</text></view
          >
          <view class="row"
            ><text>处置 {{ report.disposalCount }} 台</text
            ><text>收入 {{ formatMoney(report.disposalIncomeCents) }}</text></view
          >
          <view class="row"
            ><text>支出减处置收入</text><text>{{ formatMoney(report.netSpendCents) }}</text></view
          >
        </view>
        <view class="card"
          ><text class="section-title">每月支出</text>
          <text
            v-if="report.purchaseCount + report.maintenanceCount + report.disposalCount === 0"
            class="hint"
            >这一年暂无购买、维护或处置记录。</text
          >
          <view v-for="month in report.months" :key="month.month" class="month-row">
            <view class="row"
              ><text>{{ month.month }} 月</text
              ><text>{{ formatMoney(month.purchaseCents + month.maintenanceCents) }}</text></view
            >
            <view class="track"
              ><view class="fill" :style="{ width: `${barWidth(month)}%` }"
            /></view>
          </view>
        </view>
        <text class="hint"
          >统计当前保留的
          {{ report.deviceCount }}
          台设备，已删除设备不计入。此报告按现有记录生成，不是历史年末资产快照。</text
        >
      </template>
    </StatusView>
  </view>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import StatusView from '@/components/StatusView.vue'
import { useFeaturePage } from '@/composables/useFeaturePage'
import { getAnnualReport } from '@/services/phase11'
import { formatMoney } from '@/utils/money'
import { percentage } from '@/utils/statistics'
import type { AnnualMonth, AnnualReport } from '@/types/api/phase11'

const currentYear = new Date().getFullYear()
const year = ref(currentYear)
const report = ref<AnnualReport | null>(null)
const { state, error, load } = useFeaturePage()
const maximum = computed(() =>
  Math.max(
    0,
    ...(report.value?.months.map((month) => month.purchaseCents + month.maintenanceCents) || []),
  ),
)
function barWidth(month: AnnualMonth): number {
  return percentage(month.purchaseCents + month.maintenanceCents, maximum.value)
}
function refresh(): Promise<void> {
  return load(
    () => getAnnualReport(year.value),
    (value) => {
      report.value = value
    },
  )
}
function changeYear(event: { detail: { value: string } }): void {
  year.value = Number(event.detail.value.slice(0, 4))
  void refresh()
}
onShow(() => {
  void refresh()
})
</script>
<style scoped lang="scss">
@import '@/styles/phase11.scss';
.track {
  height: 12rpx;
  background: $gf-bg-subtle;
  border-radius: 6rpx;
  margin: 8rpx 0 18rpx;
  overflow: hidden;
}
.fill {
  height: 100%;
  background: $gf-color-primary;
}
</style>
