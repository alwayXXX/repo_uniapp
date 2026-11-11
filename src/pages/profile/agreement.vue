<template>
  <view class="page wot-text-text-main">
    <text class="title">{{ policy.title }}</text>
    <text class="meta">版本 {{ policy.version }} · {{ POLICY_PUBLISHED_AT }} 生效</text>
    <view class="content-card">
      <text class="content">{{ policy.content }}</text>
    </view>
    <wd-button type="primary" variant="soft" class="feedback-button" open-type="feedback"
      >意见反馈</wd-button
    >
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { POLICIES, POLICY_PUBLISHED_AT, type PolicyContent } from '@/constants/policies'

const policy = ref<PolicyContent>(POLICIES.privacy)

onLoad((query) => {
  const type = query?.type === 'terms' ? 'terms' : 'privacy'
  policy.value = POLICIES[type]
  uni.setNavigationBarTitle({ title: policy.value.title })
})
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  padding: 24rpx $gf-space-md calc(64rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.title {
  display: block;
  font-size: $gf-font-xl;
  font-weight: 600;
  line-height: 1.3;
  color: $gf-text-1;
  word-break: break-word;
}

.meta {
  display: block;
  margin-top: $gf-space-xs;
  font-size: $gf-font-xs;
  line-height: 1.4;
  color: $gf-text-3;
}

.content-card {
  margin-top: $gf-space-md;
  padding: $gf-space-lg;
  background-color: $gf-bg-card;
  border: 1rpx solid $gf-line;
  border-radius: $gf-radius-lg;
  box-shadow: $gf-shadow-sm;
  box-sizing: border-box;
}

.content {
  display: block;
  font-size: $gf-font-sm;
  color: $gf-text-2;
  line-height: 1.8;
  white-space: pre-line;
  word-break: break-word;
}

.feedback-button {
  margin-top: $gf-space-md;
  color: $gf-color-primary;
  background-color: $gf-color-primary-weak;
  min-height: 88rpx;
  line-height: 88rpx;
}
</style>
