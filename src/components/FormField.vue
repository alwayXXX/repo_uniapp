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
  padding: $gf-space-sm 0;
}

.label-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-bottom: $gf-space-xs;
}

.required {
  margin-right: 6rpx;
  color: $gf-color-danger;
  font-size: $gf-font-md;
}

.label {
  font-size: $gf-font-md;
  color: $gf-text-1;
}

.control {
  width: 100%;
}

.error {
  display: block;
  margin-top: $gf-space-xs;
  font-size: $gf-font-xs;
  color: $gf-color-danger;
}

.hint {
  display: block;
  margin-top: $gf-space-xs;
  font-size: $gf-font-xs;
  color: $gf-text-3;
}
</style>
