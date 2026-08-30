<template>
  <view class="page">
    <view class="hero">
      <text class="hero-title">保修与待办</text>
      <text class="hero-sub">临期保修、最近维护会集中在这里</text>
    </view>
    <StatusView
      state="empty"
      empty-title="暂无保修临期事项"
      empty-hint="添加设备并填写保修信息后，这里会展示临期看板"
    />
  </view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app'
// Phase 3+ 接入首页看板业务（ROADMAP Phase 7 首页临期展示）
import StatusView from '@/components/StatusView.vue'

const ONBOARDED_KEY = 'gf_onboarded'

onShow(() => {
  // 首次使用引导（PRD 4.1）：未完成引导时进入 onboarding
  if (uni.getStorageSync(ONBOARDED_KEY) !== '1') {
    uni.reLaunch({ url: '/pages/onboarding/index' })
  }
})
</script>

<style scoped lang="scss">
.page {
  padding: $gf-space-lg $gf-space-md;
}

.hero {
  margin-bottom: $gf-space-md;
}

.hero-title {
  font-size: $gf-font-xl;
  font-weight: 600;
  color: $gf-text-1;
}

.hero-sub {
  display: block;
  margin-top: $gf-space-xs;
  font-size: $gf-font-sm;
  color: $gf-text-3;
}
</style>
