<template>
  <view class="page">
    <StatusView
      :state="storeStatus"
      :retry-loading="status === 'loading'"
      empty-title="尚未初始化"
      @retry="bootstrap"
    >
      <view class="card">
        <view class="user-row">
          <view class="avatar">
            <text class="avatar-mark">{{ avatarChar }}</text>
          </view>
          <view class="user-info">
            <view class="name-row" @click="editNickname">
              <text class="name">{{ displayName }}</text>
              <text class="edit-mark">编辑</text>
            </view>
            <text class="uid">ID：{{ shortId }}</text>
          </view>
        </view>
      </view>

      <view class="card">
        <view class="cell" @click="openPolicy('terms')">
          <text class="cell-label">用户协议</text>
          <text class="cell-arrow">›</text>
        </view>
        <view class="cell" @click="openPolicy('privacy')">
          <text class="cell-label">隐私政策</text>
          <text class="cell-arrow">›</text>
        </view>
      </view>

      <view class="card">
        <button class="action-button" @click="onLogout">退出登录</button>
        <button class="danger-button" :disabled="deleting" @click="onDeleteAccount">
          {{ deleting ? '注销中…' : '注销账号' }}
        </button>
        <text class="danger-hint">注销将物理删除你的全部数据，且不可恢复</text>
      </view>
    </StatusView>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores/user'
import StatusView from '@/components/StatusView.vue'
import { PRIVACY_VERSION, TERMS_VERSION } from '@/constants/policies'

const ONBOARDED_KEY = 'gf_onboarded'
const CONFIRM_TEXT = '注销我的账号'

const store = useUserStore()

const storeStatus = computed(() => {
  if (store.status === 'loading') return 'loading'
  if (store.status === 'error') return 'error'
  return 'success'
})

const status = computed(() => store.status)
const deleting = computed(() => store.deleting)

const displayName = computed(() => store.user?.nickname || 'GearFlow 用户')
const avatarChar = computed(() => displayName.value.slice(0, 1).toUpperCase())
const shortId = computed(() => (store.identityId ?? '').slice(0, 8) + '…')

onShow(() => {
  if (uni.getStorageSync(ONBOARDED_KEY) !== '1') {
    uni.reLaunch({ url: '/pages/onboarding/index' })
    return
  }
  if (store.status === 'idle') {
    void bootstrap()
  }
})

async function bootstrap(): Promise<void> {
  try {
    await store.bootstrap()
  } catch {
    // 错误态已由 StatusView 呈现，重试由用户触发
  }
}

function openPolicy(type: 'privacy' | 'terms'): void {
  uni.navigateTo({ url: `/pages/profile/agreement?type=${type}` })
}

function editNickname(): void {
  uni.showModal({
    title: '修改昵称',
    editable: true,
    placeholderText: '输入新昵称（最长 64 字符）',
    success: (res) => {
      if (!res.confirm) return
      const nickname = (res.content ?? '').trim()
      if (!nickname) {
        uni.showToast({ title: '昵称不能为空', icon: 'none' })
        return
      }
      store
        .updateProfile({ nickname: nickname.slice(0, 64) })
        .then(() => uni.showToast({ title: '已更新', icon: 'success' }))
        .catch(() => uni.showToast({ title: '更新失败，请重试', icon: 'none' }))
    },
  })
}

function onLogout(): void {
  uni.showModal({
    title: '退出登录',
    content: '将清除本机登录状态，你的云端数据不受影响。',
    success: (res) => {
      if (res.confirm) {
        store.logout()
        uni.showToast({ title: '已退出登录状态', icon: 'none' })
      }
    },
  })
}

function onDeleteAccount(): void {
  uni.showModal({
    title: '注销账号',
    content: `将删除你的全部设备与维护数据（协议同意版本：隐私 ${PRIVACY_VERSION} / 条款 ${TERMS_VERSION} 亦一并删除），此操作不可恢复。`,
    confirmText: '继续',
    success: (res) => {
      if (res.confirm) askConfirmationText()
    },
  })
}

function askConfirmationText(): void {
  uni.showModal({
    title: '二次确认',
    editable: true,
    placeholderText: `请输入"${CONFIRM_TEXT}"`,
    success: (res) => {
      if (!res.confirm) return
      store
        .deleteAccount((res.content ?? '').trim())
        .then(() => {
          uni.removeStorageSync(ONBOARDED_KEY)
          uni.showToast({ title: '账号已注销', icon: 'none' })
          setTimeout(() => uni.reLaunch({ url: '/pages/home/index' }), 600)
        })
        .catch((err: Error) => {
          uni.showToast({ title: err.message || '注销失败', icon: 'none' })
        })
    },
  })
}
</script>

<style scoped lang="scss">
.page {
  padding: $gf-space-lg $gf-space-md;
}

.card {
  margin-bottom: $gf-space-md;
  padding: $gf-space-lg;
  background-color: $gf-bg-card;
  border-radius: $gf-radius-lg;
}

.user-row {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.avatar {
  width: 104rpx;
  height: 104rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: $gf-color-primary-weak;
  border-radius: 50%;
}

.avatar-mark {
  font-size: $gf-font-xl;
  font-weight: 600;
  color: $gf-color-primary;
}

.user-info {
  margin-left: $gf-space-md;
}

.name-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: $gf-space-sm;
}

.name {
  font-size: $gf-font-lg;
  font-weight: 600;
  color: $gf-text-1;
}

.edit-mark {
  font-size: $gf-font-xs;
  color: $gf-color-primary;
}

.uid {
  display: block;
  margin-top: $gf-space-xs;
  font-size: $gf-font-xs;
  color: $gf-text-3;
}

.cell {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: $gf-space-sm 0;
}

.cell-label {
  font-size: $gf-font-md;
  color: $gf-text-1;
}

.cell-arrow {
  font-size: $gf-font-lg;
  color: $gf-text-4;
}

.action-button {
  margin-bottom: $gf-space-sm;
  font-size: $gf-font-md;
  color: $gf-text-1;
  background-color: $gf-bg-page;
  border-radius: $gf-radius-md;
}

.danger-button {
  font-size: $gf-font-md;
  color: $gf-color-danger;
  background-color: #ffece8;
  border-radius: $gf-radius-md;
}

.danger-hint {
  display: block;
  margin-top: $gf-space-xs;
  font-size: $gf-font-xs;
  color: $gf-text-3;
  text-align: center;
}
</style>
