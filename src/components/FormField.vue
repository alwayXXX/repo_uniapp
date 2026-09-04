<template>
  <view class="form-field">
    <view v-if="label" class="label-row">
      <text v-if="required" class="required">*</text>
      <text class="label">{{ label }}</text>
    </view>
    <view class="control">
      <slot />
    </view>
    <text v-if="error" class="error">{{ error }}</text>
    <text v-else-if="hint" class="hint">{{ hint }}</text>
  </view>
</template>

<script setup lang="ts">
/**
 * 表单基础组件：统一 label / 必填标记 / 错误与提示文案的布局。
 * 具体控件（输入框、日期选择、金额输入等）通过默认插槽传入。
 */
withDefaults(
  defineProps<{
    label?: string
    required?: boolean
    error?: string
    hint?: string
  }>(),
  { label: '', required: false, error: '', hint: '' },
)
</script>

<style scoped lang="scss">
.form-field {
  padding: 18rpx 0;
}

.label-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  min-height: 34rpx;
  margin-bottom: 10rpx;
}

.required {
  margin-right: 6rpx;
  color: $gf-color-danger;
  font-size: $gf-font-sm;
  line-height: 1;
}

.label {
  font-size: $gf-font-sm;
  font-weight: 600;
  line-height: 1.4;
  color: $gf-text-1;
}

.control {
  width: 100%;
  min-width: 0;
}

.control > view,
.control > input,
.control > textarea,
.control > picker {
  min-width: 0;
  box-sizing: border-box;
}

.error {
  display: block;
  margin-top: 10rpx;
  font-size: $gf-font-xs;
  line-height: 1.45;
  color: $gf-color-danger;
}

.hint {
  display: block;
  margin-top: 10rpx;
  font-size: $gf-font-xs;
  line-height: 1.45;
  color: $gf-text-3;
}
</style>
