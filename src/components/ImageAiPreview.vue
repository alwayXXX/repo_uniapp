<template>
  <view class="ai-preview">
    <text class="heading">确认发送图片</text>
    <text class="hint"
      >这张图片将发送给腾讯云 CloudBase 及第三方 DeepSeek
      模型识别。云平台日志可能记录返回的内容；服务方按其规则处理及保存数据。</text
    >
    <image class="image" :src="imagePath" mode="aspectFit" />
    <text class="hint"
      >预览为实际发送的图片，较大的图片可能已在本机压缩。请先遮盖姓名、地址、序列号等不想发送的内容；图片也可能含拍摄地点等元数据，请先处理。识别结果可能有误，需要你核对后再保存。</text
    >
    <button class="primary" :disabled="busy || !imagePath" @click="emit('confirm')">
      {{ busy ? '正在识别…' : '同意并识别' }}
    </button>
  </view>
</template>

<script setup lang="ts">
defineProps<{ imagePath: string; busy: boolean }>()
const emit = defineEmits<{ confirm: [] }>()
</script>

<style scoped lang="scss">
@import '@/styles/ai-preview.scss';
.image {
  display: block;
  width: 100%;
  height: 360rpx;
  background: $gf-bg-subtle;
}
</style>
