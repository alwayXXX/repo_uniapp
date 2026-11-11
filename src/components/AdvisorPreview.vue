<template>
  <view class="ai-preview">
    <text class="heading">确认发送内容</text>
    <text class="hint"
      >以下摘要将发送给腾讯云 CloudBase 及第三方 DeepSeek
      模型，用于生成建议。云平台日志可能记录返回的内容；服务方按其规则处理及保存数据，请先核对。</text
    >
    <view class="row"
      ><text>统计日期</text><text>{{ facts.asOf }}</text></view
    >
    <view class="row"
      ><text>设备分类</text><text>{{ facts.category || '未填写' }}</text></view
    >
    <view class="row"
      ><text>品牌</text><text>{{ facts.brand || '未填写' }}</text></view
    >
    <view class="row"
      ><text>型号</text><text>{{ facts.model || '未填写' }}</text></view
    >
    <view class="row"
      ><text>状态</text><text>{{ DEVICE_STATUS_LABELS[facts.status] }}</text></view
    >
    <view class="row"
      ><text>购买日期</text><text>{{ facts.purchaseDate || '未填写' }}</text></view
    >
    <view class="row"
      ><text>保修结束日期</text><text>{{ facts.warrantyEndDate || '未填写' }}</text></view
    >
    <view class="row"
      ><text>维护记录</text><text>{{ facts.maintenanceCount }} 次</text></view
    >
    <view class="row"
      ><text>已记录维护费用</text><text>{{ formatMoney(facts.knownMaintenanceCents) }}</text></view
    >
    <text v-if="facts.maintenanceCostUnknownCount" class="hint"
      >其中 {{ facts.maintenanceCostUnknownCount }} 条未填写费用，不计入已记录费用。</text
    >
    <text class="hint"
      >序列号、设备备注、发票和附件不会自动发送。AI 建议可能有误，请自行核对。</text
    >
    <button class="primary" :disabled="busy" @click="emit('confirm')">
      {{ busy ? '正在生成…' : '同意并生成建议' }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { DEVICE_STATUS_LABELS } from '@/constants/device'
import { formatMoney } from '@/utils/money'
import type { AdvisorFacts } from '@/types/api/ai'

defineProps<{ facts: AdvisorFacts; busy: boolean }>()
const emit = defineEmits<{ confirm: [] }>()
</script>

<style scoped lang="scss">
@import '@/styles/ai-preview.scss';
</style>
