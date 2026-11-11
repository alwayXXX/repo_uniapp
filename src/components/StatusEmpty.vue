<template>
  <wd-empty class="status-empty" :tip="title">
    <template #bottom>
      <text v-if="hint" class="hint">{{ hint }}</text>
      <view v-if="$slots.action" class="action"><slot name="action" /></view>
    </template>
  </wd-empty>
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
