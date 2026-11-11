<template>
  <wd-button
    block
    variant="text"
    :type="danger ? 'danger' : 'primary'"
    custom-class="gf-tool-action"
    :disabled="disabled"
    @click="emit('click')"
  >
    <view class="tool-row" :class="{ danger }">
      <view class="tool-icon"><wd-icon :name="icon" size="20px" /></view>
      <view class="tool-copy">
        <text class="tool-title">{{ title }}</text>
        <text v-if="subtitle" class="tool-subtitle">{{ subtitle }}</text>
      </view>
      <wd-icon name="arrow-right" size="15px" color="#9aa9b9" />
    </view>
  </wd-button>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    icon: string
    danger?: boolean
    disabled?: boolean
  }>(),
  { subtitle: '', danger: false, disabled: false },
)
const emit = defineEmits<{ click: [] }>()
</script>

<style scoped lang="scss">
.tool-row {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 24rpx;
  padding: 24rpx 0;
  text-align: left;
}
.tool-icon {
  display: flex;
  flex: 0 0 72rpx;
  width: 72rpx;
  height: 72rpx;
  align-items: center;
  justify-content: center;
  border-radius: 20rpx;
  color: #3977c9;
  background: #edf4ff;
}
.tool-copy {
  min-width: 0;
  flex: 1;
}
.tool-title,
.tool-subtitle {
  display: block;
}
.tool-title {
  color: #20334a;
  font-size: 28rpx;
  font-weight: 600;
  line-height: 1.4;
}
.tool-subtitle {
  margin-top: 6rpx;
  color: #6f7782;
  font-size: 22rpx;
  line-height: 1.45;
  white-space: normal;
}
.danger .tool-icon {
  color: #c83c36;
  background: #fff1f0;
}
.danger .tool-title {
  color: #c83c36;
}
</style>
