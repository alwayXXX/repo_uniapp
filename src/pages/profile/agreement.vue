<template>
  <view class="page">
    <text class="title">{{ policy.title }}</text>
    <text class="meta">版本 {{ policy.version }} · {{ POLICY_PUBLISHED_AT }} 生效</text>
    <view class="content-card">
      <text class="content">{{ policy.content }}</text>
    </view>
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
  padding: $gf-space-lg $gf-space-md;
}

.title {
  font-size: $gf-font-xl;
  font-weight: 600;
  color: $gf-text-1;
}

.meta {
  display: block;
  margin-top: $gf-space-xs;
  font-size: $gf-font-xs;
  color: $gf-text-3;
}

.content-card {
  margin-top: $gf-space-md;
  padding: $gf-space-lg;
  background-color: $gf-bg-card;
  border-radius: $gf-radius-lg;
}

.content {
  font-size: $gf-font-sm;
  color: $gf-text-2;
  line-height: 1.8;
  white-space: pre-line;
}
</style>
