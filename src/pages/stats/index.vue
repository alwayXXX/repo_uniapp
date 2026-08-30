<template>
  <view class="page">
    <StatusView
      state="empty"
      empty-title="暂无统计数据"
      empty-hint="录入设备与维护记录后，这里会展示资产与支出洞察"
    />
  </view>
</template>

<script setup lang="ts">
// Phase 8 接入统计业务（ROADMAP）
import StatusView from '@/components/StatusView.vue'
</script>

<style scoped lang="scss">
.page {
  padding: $gf-space-lg $gf-space-md;
}
</style>
