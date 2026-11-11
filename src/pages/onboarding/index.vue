<template>
  <view class="page wot-text-text-main">
    <view class="brand-lockup">
      <view class="brand-mark"><text>G</text></view>
      <text class="title">GearFlow</text>
    </view>
    <text class="subtitle">低负担的设备资产台账</text>

    <view class="features">
      <view class="feature">
        <view class="feature-icon"><wd-icon name="desktop" size="24px" color="#1a73e8" /></view>
        <view class="feature-text">
          <text class="feature-title">记录设备档案</text>
          <text class="feature-desc">名称、购买、保修、维护，五项内完成首台录入</text>
        </view>
      </view>
      <view class="feature">
        <view class="feature-icon"
          ><wd-icon name="calendar-line" size="24px" color="#1a73e8"
        /></view>
        <view class="feature-text">
          <text class="feature-title">保修不再错过</text>
          <text class="feature-desc">自动计算保修状态，临期事项集中提醒</text>
        </view>
      </view>
      <view class="feature">
        <view class="feature-icon"><wd-icon name="dashboard" size="24px" color="#1a73e8" /></view>
        <view class="feature-text">
          <text class="feature-title">看清资产与支出</text>
          <text class="feature-desc">设备数量、总资产、年度支出一目了然</text>
        </view>
      </view>
    </view>

    <view class="agreement">
      <checkbox-group @change="onAgreeChange">
        <label class="agree-row">
          <checkbox class="agree-checkbox" :checked="agreed" color="#1a73e8" />
          <text class="agree-text">我已阅读并同意</text>
        </label>
      </checkbox-group>
      <view class="agree-links">
        <text class="agree-link" @click="openPolicy('privacy')">《用户隐私保护指引》</text>
        <text class="agree-link" @click="openPolicy('terms')">《用户服务协议》</text>
      </view>
    </view>

    <wd-button
      class="enter-button"
      block
      size="large"
      :disabled="!agreed || bootstrapping"
      @click="onEnter"
    >
      {{ bootstrapping ? '正在初始化…' : '同意并开始使用' }}
    </wd-button>
    <text v-if="errorMessage" class="error">{{ errorMessage }}</text>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useUserStore } from '@/stores/user'
import { toAppError } from '@/utils/error'

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
    await userStore.acceptPolicies()
    uni.reLaunch({ url: '/pages/home/index' })
  } catch (err) {
    errorMessage.value = toAppError(err).message
  } finally {
    bootstrapping.value = false
  }
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  padding: 120rpx $gf-space-lg calc(64rpx + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  background-color: $gf-bg-page;
}

.brand-lockup {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: $gf-space-sm;
}

.brand-mark {
  width: 72rpx;
  height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: $gf-color-primary;
  border-radius: 20rpx;
  box-shadow: $gf-shadow-sm;
}

.brand-mark text {
  font-size: 38rpx;
  font-weight: 700;
  line-height: 1;
  color: #ffffff;
}

.title {
  font-size: 48rpx;
  font-weight: 700;
  line-height: 1.2;
  color: $gf-text-1;
}

.subtitle {
  margin-top: $gf-space-xs;
  font-size: $gf-font-md;
  line-height: 1.45;
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
  border-bottom: 1rpx solid $gf-line;
}

.feature:last-child {
  border-bottom: 0;
}

.feature-icon {
  width: 72rpx;
  height: 72rpx;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: $gf-space-md;
  background-color: $gf-color-primary-weak;
  border-radius: $gf-radius-md;
}

.feature-text {
  min-width: 0;
  flex: 1;
}

.feature-title {
  display: block;
  font-size: $gf-font-md;
  font-weight: 600;
  line-height: 1.4;
  color: $gf-text-1;
}

.feature-desc {
  display: block;
  margin-top: 4rpx;
  font-size: $gf-font-sm;
  line-height: 1.5;
  color: $gf-text-3;
}

.agreement {
  margin-top: auto;
  padding-top: 56rpx;
}

.agree-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  min-height: 56rpx;
}

.agree-checkbox {
  transform: scale(0.8);
}

.agree-text {
  font-size: $gf-font-sm;
  line-height: 1.4;
  color: $gf-text-2;
}

.agree-links {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8rpx $gf-space-sm;
  margin-top: $gf-space-xs;
  padding-left: 44rpx;
}

.agree-link {
  font-size: $gf-font-xs;
  line-height: 1.4;
  color: $gf-color-primary;
}

.enter-button {
  width: 100%;
  height: 92rpx;
  min-height: 92rpx;
  margin-top: $gf-space-lg;
  padding: 0 $gf-space-lg;
  background-color: $gf-color-primary;
  color: #ffffff;
  font-size: $gf-font-lg;
  font-weight: 600;
  line-height: 92rpx;
  border-radius: $gf-control-radius;
}

.enter-button[disabled] {
  background-color: $gf-text-4;
  color: #ffffff;
}

.error {
  display: block;
  margin-top: $gf-space-sm;
  font-size: $gf-font-sm;
  line-height: 1.45;
  color: $gf-color-danger;
  text-align: center;
}
</style>
