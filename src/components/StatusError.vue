<template>
  <view class="status-error">
    <view class="glyph">
      <text class="glyph-mark">!</text>
    </view>
    <text class="title">{{ text }}</text>
    <text v-if="hint" class="hint">{{ hint }}</text>
    <button v-if="retryable" class="retry" :disabled="loading" @click="emit('retry')">
      {{ loading ? '重试中…' : '重试' }}
    </button>
  </view>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    text?: string
    hint?: string
    retryable?: boolean
    loading?: boolean
  }>(),
  { text: '加载失败，请稍后重试', hint: '', retryable: true, loading: false },
)

const emit = defineEmits<{ retry: [] }>()
</script>

<style scoped lang="scss">
.status-error {
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
  background-color: #ffece8;
  border-radius: 50%;
}

.glyph-mark {
  font-size: 52rpx;
  font-weight: 600;
  color: $gf-color-danger;
}

.title {
  margin-top: $gf-space-md;
  font-size: $gf-font-md;
  color: $gf-text-2;
  text-align: center;
}

.hint {
  margin-top: $gf-space-xs;
  font-size: $gf-font-sm;
  color: $gf-text-3;
  text-align: center;
}

.retry {
  margin-top: $gf-space-lg;
  padding: 0 $gf-space-xl;
  font-size: $gf-font-md;
  color: $gf-color-primary;
  background-color: $gf-color-primary-weak;
  border-radius: $gf-radius-md;
}
</style>
