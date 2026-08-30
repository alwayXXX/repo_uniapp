<template>
  <view class="page">
    <text class="section-title">StatusView 五态</text>
    <view class="state-buttons">
      <button
        v-for="item in STATES"
        :key="item"
        class="state-button"
        :class="{ active: currentState === item }"
        @click="currentState = item"
      >
        {{ item }}
      </button>
    </view>
    <view class="card">
      <StatusView
        :state="currentState"
        empty-title="暂无设备"
        empty-hint="这是空状态提示文案示例"
        error-text="网络异常，加载失败"
        :retry-loading="retryLoading"
        @retry="onRetry"
      >
        <view class="mock-content">
          <text class="mock-line">success 态：业务内容插槽</text>
          <text class="mock-line">MacBook Pro · 使用中</text>
          <text class="mock-line">iPhone 15 · 使用中</text>
        </view>
      </StatusView>
    </view>

    <text class="section-title">独立组件</text>
    <view class="card">
      <StatusLoading text="正在同步设备…" />
    </view>
    <view class="card">
      <StatusEmpty title="还没有维护记录" hint="添加一条维护记录试试">
        <template #action>
          <button class="mini-button" @click="onTodo">维护记录（Phase 7）</button>
        </template>
      </StatusEmpty>
    </view>
    <view class="card">
      <StatusError text="服务暂时不可用" hint="错误状态示例" @retry="onRetry" />
    </view>

    <text class="section-title">FormField 表单基础件</text>
    <view class="card">
      <FormField label="设备名称" required hint="不超过 64 个字符" :error="nameError">
        <input
          v-model="deviceName"
          class="demo-input"
          placeholder="例如：MacBook Pro"
          @blur="validateName"
        />
      </FormField>
      <FormField label="备注（可选）">
        <input class="demo-input" placeholder="选填" />
      </FormField>
      <button class="mini-button" @click="validateName">触发校验演示</button>
    </view>

    <text class="section-title">色彩 Token</text>
    <view class="card">
      <view class="swatches">
        <view v-for="(value, key) in COLORS" :key="key" class="swatch">
          <view class="swatch-color" :style="{ backgroundColor: value }" />
          <text class="swatch-label">{{ key }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import FormField from '@/components/FormField.vue'
import StatusEmpty from '@/components/StatusEmpty.vue'
import StatusError from '@/components/StatusError.vue'
import StatusLoading from '@/components/StatusLoading.vue'
import StatusView from '@/components/StatusView.vue'
import { COLORS } from '@/styles/tokens'
import type { PageState } from '@/types/api/common'

// forbidden 与 error 渲染同一组件，仅文案不同，预览中合并展示
const STATES = ['loading', 'success', 'empty', 'error', 'forbidden'] as const
const currentState = ref<PageState>('loading')
const retryLoading = ref(false)

function onRetry(): void {
  retryLoading.value = true
  setTimeout(() => {
    retryLoading.value = false
    currentState.value = 'success'
  }, 800)
}

function onTodo(): void {
  uni.showToast({ title: '该功能尚未开放', icon: 'none' })
}

const deviceName = ref('')
const nameError = ref('')

function validateName(): void {
  nameError.value = deviceName.value.trim() === '' ? '设备名称不能为空' : ''
}
</script>

<style scoped lang="scss">
.page {
  padding: $gf-space-lg $gf-space-md;
}

.section-title {
  display: block;
  margin: $gf-space-lg 0 $gf-space-sm;
  font-size: $gf-font-md;
  font-weight: 600;
  color: $gf-text-1;
}

.card {
  padding: $gf-space-md;
  background-color: $gf-bg-card;
  border-radius: $gf-radius-lg;
}

.state-buttons {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: $gf-space-xs;
  margin-bottom: $gf-space-sm;
}

.state-button {
  margin: 0;
  padding: 0 $gf-space-sm;
  line-height: 2;
  font-size: $gf-font-xs;
  color: $gf-text-2;
  background-color: $gf-bg-page;
  border-radius: $gf-radius-sm;
}

.state-button.active {
  color: #ffffff;
  background-color: $gf-color-primary;
}

.mock-content {
  padding: $gf-space-sm 0;
}

.mock-line {
  display: block;
  padding: $gf-space-xs 0;
  font-size: $gf-font-sm;
  color: $gf-text-2;
}

.mini-button {
  margin: $gf-space-sm 0 0;
  font-size: $gf-font-sm;
  color: $gf-color-primary;
  background-color: $gf-color-primary-weak;
  border-radius: $gf-radius-md;
}

.demo-input {
  padding: $gf-space-sm;
  font-size: $gf-font-md;
  background-color: $gf-bg-page;
  border-radius: $gf-radius-md;
}

.swatches {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: $gf-space-sm;
}

.swatch {
  width: 140rpx;
}

.swatch-color {
  width: 100%;
  height: 72rpx;
  border-radius: $gf-radius-sm;
  border: 1rpx solid $gf-line;
}

.swatch-label {
  display: block;
  margin-top: $gf-space-xs;
  font-size: 20rpx;
  color: $gf-text-3;
  text-align: center;
}
</style>
