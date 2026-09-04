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
  min-width: 0;
  padding: $gf-space-xl $gf-space-lg;
}

.glyph {
  width: 112rpx;
  height: 112rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: $gf-bg-page;
  border: 1rpx solid $gf-line;
  border-radius: 50%;
}

.glyph-mark {
  font-size: 48rpx;
  color: $gf-text-4;
}

.title {
  margin-top: $gf-space-md;
  font-size: $gf-font-md;
  line-height: 1.4;
  color: $gf-text-2;
  text-align: center;
}

.hint {
  margin-top: $gf-space-xs;
  font-size: $gf-font-sm;
  line-height: 1.5;
  color: $gf-text-3;
  text-align: center;
  word-break: break-word;
}

.action {
  margin-top: $gf-space-lg;
}
</style>
