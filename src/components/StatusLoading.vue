<template>
  <view class="status-loading wot-text-text-secondary">
    <wd-loading type="circular" size="24px" color="#1a73e8" />
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

.text {
  margin-top: $gf-space-sm;
  font-size: $gf-font-sm;
  line-height: 1.45;
  color: $gf-text-3;
  text-align: center;
}
</style>
