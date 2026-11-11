<template>
  <view class="status-error">
    <view class="glyph">
      <wd-icon name="info-circle" size="26px" color="#d93025" />
    </view>
    <text class="title">{{ text }}</text>
    <text v-if="hint" class="hint">{{ hint }}</text>
    <wd-button
      v-if="retryable"
      type="primary"
      variant="soft"
      class="retry"
      :disabled="loading"
      @click="emit('retry')"
    >
      {{ loading ? '重试中…' : '重试' }}
    </wd-button>
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
  min-width: 0;
  padding: $gf-space-xl $gf-space-lg;
}

.glyph {
  width: 112rpx;
  height: 112rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: $gf-color-danger-weak;
  border: 1rpx solid $gf-color-danger-weak;
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
  line-height: 1.4;
  color: $gf-text-2;
  text-align: center;
  word-break: break-word;
}

.hint {
  margin-top: $gf-space-xs;
  font-size: $gf-font-sm;
  line-height: 1.5;
  color: $gf-text-3;
  text-align: center;
  word-break: break-word;
}

.retry {
  height: 80rpx;
  min-height: 80rpx;
  margin-top: $gf-space-lg;
  padding: 0 $gf-space-lg;
  font-size: $gf-font-md;
  line-height: 80rpx;
  color: $gf-color-primary;
  background-color: $gf-color-primary-weak;
  border-radius: $gf-control-radius;
}
</style>
