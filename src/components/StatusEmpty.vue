<template>
  <view class="status-empty">
    <view class="glyph">
      <text class="glyph-mark">∅</text>
    </view>
    <text class="title">{{ title }}</text>
    <text v-if="hint" class="hint">{{ hint }}</text>
    <view v-if="$slots.action" class="action">
      <slot name="action" />
    </view>
  </view>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ title?: string; hint?: string }>(), {
  title: '暂无数据',
  hint: '',
})
</script>

<style scoped lang="scss">
.status-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: $gf-space-xl $gf-space-lg;
}

.glyph {
  width: 112rpx;
  height: 112rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: $gf-bg-page;
  border-radius: 50%;
}

.glyph-mark {
  font-size: 48rpx;
  color: $gf-text-4;
}

.title {
  margin-top: $gf-space-md;
  font-size: $gf-font-md;
  color: $gf-text-2;
}

.hint {
  margin-top: $gf-space-xs;
  font-size: $gf-font-sm;
  color: $gf-text-3;
  text-align: center;
}

.action {
  margin-top: $gf-space-lg;
}
</style>
