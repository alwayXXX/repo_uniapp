<template>
  <view class="ai-preview">
    <text class="heading">确认发送年度统计</text>
    <text class="hint"
      >以下年度和逐月汇总将发送给腾讯云 CloudBase 及第三方 DeepSeek
      模型，用于生成解读。云平台日志可能记录返回的内容；服务方按其规则处理及保存数据。</text
    >
    <view class="row"
      ><text>年度 / 当前设备</text
      ><text>{{ facts.year }} 年 / {{ facts.deviceCount }} 台</text></view
    >
    <view class="row"
      ><text>购入 / 金额</text
      ><text>{{ facts.purchaseCount }} 次 / {{ formatMoney(facts.purchaseCents) }}</text></view
    >
    <view class="row"
      ><text>维护 / 金额</text
      ><text
        >{{ facts.maintenanceCount }} 次 / {{ formatMoney(facts.maintenanceCents) }}</text
      ></view
    >
    <view class="row"
      ><text>处置 / 收入</text
      ><text
        >{{ facts.disposalCount }} 次 / {{ formatMoney(facts.disposalIncomeCents) }}</text
      ></view
    >
    <view class="row"
      ><text>总支出 / 净支出</text
      ><text
        >{{ formatMoney(facts.totalSpendCents) }} / {{ formatMoney(facts.netSpendCents) }}</text
      ></view
    >
    <view v-for="month in facts.months" :key="month.month" class="month">
      <text>{{ month.month }} 月</text>
      <text class="hint"
        >购入 {{ month.purchaseCount }} 次 {{ formatMoney(month.purchaseCents) }}；维护
        {{ month.maintenanceCount }} 次 {{ formatMoney(month.maintenanceCents) }}；处置
        {{ month.disposalCount }} 次 {{ formatMoney(month.disposalIncomeCents) }}</text
      >
    </view>
    <text class="hint">未填写的金额不计入统计。AI 解读仅供参考，报告数字以原始统计为准。</text>
    <button class="primary" :disabled="busy" @click="emit('confirm')">
      {{ busy ? '正在生成…' : '同意并生成解读' }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { formatMoney } from '@/utils/money'
import type { AnnualFacts } from '@/types/api/ai'

defineProps<{ facts: AnnualFacts; busy: boolean }>()
const emit = defineEmits<{ confirm: [] }>()
</script>

<style scoped lang="scss">
@import '@/styles/ai-preview.scss';
.month {
  padding-top: $gf-space-sm;
}
</style>
