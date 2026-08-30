<template>
  <view class="page">
    <text class="title">GearFlow</text>
    <text class="subtitle">低负担的设备资产台账</text>

    <view class="features">
      <view class="feature">
        <text class="feature-icon">📋</text>
        <view class="feature-text">
          <text class="feature-title">记录设备档案</text>
          <text class="feature-desc">名称、购买、保修、维护，五项内完成首台录入</text>
        </view>
      </view>
      <view class="feature">
        <text class="feature-icon">⏰</text>
        <view class="feature-text">
          <text class="feature-title">保修不再错过</text>
          <text class="feature-desc">自动计算保修状态，临期事项集中提醒</text>
        </view>
      </view>
      <view class="feature">
        <text class="feature-icon">📊</text>
        <view class="feature-text">
          <text class="feature-title">看清资产与支出</text>
          <text class="feature-desc">设备数量、总资产、年度支出一目了然</text>
        </view>
      </view>
    </view>

    <view class="agreement">
      <checkbox-group @change="onAgreeChange">
        <label class="agree-row">
          <checkbox class="agree-checkbox" :checked="agreed" color="#165dff" />
          <text class="agree-text">我已阅读并同意</text>
        </label>
      </checkbox-group>
      <view class="agree-links">
        <text class="agree-link" @click="openPolicy('privacy')">《用户隐私保护指引》</text>
        <text class="agree-link" @click="openPolicy('terms')">《用户服务协议》</text>
      </view>
    </view>

    <button class="enter-button" :disabled="!agreed || bootstrapping" @click="onEnter">
      {{ bootstrapping ? '正在初始化…' : '同意并开始使用' }}
    </button>
    <text v-if="errorMessage" class="error">{{ errorMessage }}</text>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useUserStore } from '@/stores/user'

const ONBOARDED_KEY = 'gf_onboarded'

const userStore = useUserStore()
const agreed = ref(false)
const bootstrapping = ref(false)
const errorMessage = ref('')

function onAgreeChange(event: { detail: { value: string[] } }): void {
  agreed.value = event.detail.value.length > 0
}

function openPolicy(type: 'privacy' | 'terms'): void {
  uni.navigateTo({ url: `/pages/profile/agreement?type=${type}` })
}

async function onEnter(): Promise<void> {
  if (!agreed.value || bootstrapping.value) return
  bootstrapping.value = true
  errorMessage.value = ''
  try {
    await userStore.bootstrap()
    uni.setStorageSync(ONBOARDED_KEY, '1')
    uni.reLaunch({ url: '/pages/home/index' })
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '初始化失败，请重试'
  } finally {
    bootstrapping.value = false
  }
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  padding: 120rpx $gf-space-lg $gf-space-xl;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  background-color: $gf-bg-card;
}

.title {
  font-size: 56rpx;
  font-weight: 700;
  color: $gf-text-1;
}

.subtitle {
  margin-top: $gf-space-xs;
  font-size: $gf-font-md;
  color: $gf-text-3;
}

.features {
  margin-top: $gf-space-xl;
}

.feature {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: $gf-space-md 0;
}

.feature-icon {
  font-size: 44rpx;
  margin-right: $gf-space-md;
}

.feature-title {
  font-size: $gf-font-md;
  font-weight: 600;
  color: $gf-text-1;
}

.feature-desc {
  display: block;
  margin-top: 4rpx;
  font-size: $gf-font-sm;
  color: $gf-text-3;
}

.agreement {
  margin-top: auto;
  padding-top: $gf-space-xl;
}

.agree-row {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.agree-checkbox {
  transform: scale(0.8);
}

.agree-text {
  font-size: $gf-font-sm;
  color: $gf-text-2;
}

.agree-links {
  margin-top: $gf-space-xs;
  padding-left: 44rpx;
}

.agree-link {
  font-size: $gf-font-xs;
  color: $gf-color-primary;
  margin-right: $gf-space-sm;
}

.enter-button {
  margin-top: $gf-space-lg;
  background-color: $gf-color-primary;
  color: #ffffff;
  font-size: $gf-font-lg;
}

.enter-button[disabled] {
  background-color: $gf-text-4;
  color: #ffffff;
}

.error {
  display: block;
  margin-top: $gf-space-sm;
  font-size: $gf-font-sm;
  color: $gf-color-danger;
  text-align: center;
}
</style>
