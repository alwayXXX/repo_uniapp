<template>
  <view class="status-loading">
    <view class="spinner" />
    <text class="text">{{ text }}</text>
  </view>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ text?: string }>(), { text: '加载中…' })
</script>

<style scoped lang="scss">
.status-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  padding: $gf-space-xl 0;
}

.spinner {
  width: 48rpx;
  height: 48rpx;
  border: 4rpx solid $gf-color-primary-weak;
  border-top-color: $gf-color-primary;
  border-radius: 50%;
  animation: gf-spin 0.8s linear infinite;
}

.text {
  margin-top: $gf-space-sm;
  font-size: $gf-font-sm;
  line-height: 1.45;
  color: $gf-text-3;
  text-align: center;
}

@keyframes gf-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
