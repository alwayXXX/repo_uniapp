<template>
  <view class="p11-page wot-text-text-main">
    <text class="eyebrow">GEARFLOW / 年度回顾</text>
    <text class="title">{{ year }} 年设备报告</text>
    <GearPicker
      mode="date"
      fields="year"
      start="1970"
      :end="String(currentYear)"
      :value="String(year)"
      @change="changeYear"
    >
      <view class="card wot-bg-filled-oppo wot-rounded-lg">选择年份 · {{ year }} 年 ›</view>
    </GearPicker>
    <StatusView :state="state" :error-text="error" @retry="refresh">
      <template v-if="report">
        <view class="card wot-bg-filled-oppo wot-rounded-lg"
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
        <view class="card wot-bg-filled-oppo wot-rounded-lg"
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
            <wd-progress
              :percentage="barWidth(month)"
              color="#1a73e8"
              :duration="0"
              hide-text
              custom-style="--wot-progress-height: 12rpx; --wot-progress-bar-height: 12rpx; margin: 8rpx 0 18rpx"
            />
          </view>
        </view>
        <text class="hint"
          >统计当前保留的
          {{ report.deviceCount }}
          台设备，已删除设备不计入。此报告按现有记录生成，不是历史年末资产快照。</text
        >
        <view class="card wot-bg-filled-oppo wot-rounded-lg">
          <text class="section-title">AI 年度解读</text>
          <wd-button
            v-if="!annualFacts"
            type="primary"
            variant="soft"
            :disabled="aiBusy"
            @click="previewAnnual"
          >
            查看发送内容
          </wd-button>
          <AnnualAiPreview
            v-if="annualFacts"
            :facts="annualFacts"
            :busy="aiBusy"
            @confirm="generateAnnual"
          />
          <text v-if="aiError" class="hint">{{ aiError }}</text>
          <view v-if="aiResult">
            <text class="hint">AI 内容仅供参考，数字以报告为准。</text>
            <view v-for="(item, index) in aiResult.observations" :key="`observation-${index}`">{{
              item
            }}</view>
            <view v-for="(item, index) in aiResult.suggestions" :key="`suggestion-${index}`">{{
              item
            }}</view>
          </view>
        </view>
      </template>
    </StatusView>
  </view>
</template>
<script setup lang="ts">
import GearPicker from '@/components/GearPicker.vue'
import { computed, ref } from 'vue'
import { onHide, onShow } from '@dcloudio/uni-app'
import StatusView from '@/components/StatusView.vue'
import AnnualAiPreview from '@/components/AnnualAiPreview.vue'
import { useFeaturePage } from '@/composables/useFeaturePage'
import { getAnnualReport } from '@/services/phase11'
import { requestAnnual } from '@/services/ai'
import { requireCurrentConsent } from '@/services/consent'
import { buildAnnualFacts } from '@/utils/ai-input'
import { toAppError } from '@/utils/error'
import { formatMoney } from '@/utils/money'
import { percentage } from '@/utils/statistics'
import type { AnnualMonth, AnnualReport } from '@/types/api/phase11'
import type { AnnualFacts, AnnualResult } from '@/types/api/ai'

const currentYear = new Date().getFullYear()
const year = ref(currentYear)
const report = ref<AnnualReport | null>(null)
const annualFacts = ref<AnnualFacts | null>(null)
const aiResult = ref<AnnualResult | null>(null)
const aiError = ref('')
const aiBusy = ref(false)
let aiVersion = 0
function clearAi(): void {
  aiVersion++
  annualFacts.value = null
  aiResult.value = null
  aiError.value = ''
  aiBusy.value = false
}
function previewAnnual(): void {
  if (!report.value || !requireCurrentConsent()) return
  try {
    annualFacts.value = buildAnnualFacts(report.value)
    aiError.value = ''
  } catch (error) {
    aiError.value = toAppError(error).message
  }
}
async function generateAnnual(): Promise<void> {
  if (!annualFacts.value || aiBusy.value || !requireCurrentConsent()) return
  const version = aiVersion
  aiBusy.value = true
  aiError.value = ''
  aiResult.value = null
  try {
    const result = await requestAnnual(annualFacts.value)
    if (version === aiVersion) aiResult.value = result
  } catch (error) {
    if (version === aiVersion) aiError.value = toAppError(error).message
  } finally {
    if (version === aiVersion) aiBusy.value = false
  }
}
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
  clearAi()
  year.value = Number(event.detail.value.slice(0, 4))
  void refresh()
}
onHide(clearAi)
onShow(() => {
  void refresh()
})
</script>
<style scoped lang="scss">
@import '@/styles/phase11.scss';
</style>
