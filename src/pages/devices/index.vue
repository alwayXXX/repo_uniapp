<template>
  <view class="page">
    <StatusView state="empty" empty-title="暂无设备" empty-hint="添加第一台设备，开始你的设备台账">
      <template #empty-action>
        <button class="add-button" @click="onAddClick">添加设备</button>
      </template>
    </StatusView>
  </view>
</template>

<script setup lang="ts">
import StatusView from '@/components/StatusView.vue'

// 设备创建页在 Phase 4 落地（ROADMAP）
function onAddClick(): void {
  uni.showToast({ title: '添加设备将在 Phase 4 开放', icon: 'none' })
}
</script>

<style scoped lang="scss">
.page {
  padding: $gf-space-lg $gf-space-md;
}

.add-button {
  padding: 0 $gf-space-xl;
  font-size: $gf-font-md;
  color: #ffffff;
  background-color: $gf-color-primary;
  border-radius: $gf-radius-md;
}
</style>
