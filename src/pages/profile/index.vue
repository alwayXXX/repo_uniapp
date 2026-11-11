<template>
  <view class="page wot-text-text-main">
    <StatusView
      :state="storeStatus"
      :retry-loading="status === 'loading'"
      empty-title="尚未初始化"
      @retry="bootstrap"
    >
      <view class="card profile-hero">
        <view class="user-row">
          <view class="avatar">
            <text class="avatar-mark">{{ avatarChar }}</text>
          </view>
          <view class="user-info">
            <view class="name-row" @click="editNickname">
              <text class="name">{{ displayName }}</text>
              <text class="edit-mark">编辑</text>
            </view>
            <text class="user-caption">你的设备数据仅对你可见</text>
          </view>
        </view>
      </view>

      <view class="card wot-bg-filled-oppo wot-rounded-lg">
        <view class="cell" @click="openPolicy('terms')">
          <text class="cell-label">用户协议</text>
          <text class="cell-arrow">›</text>
        </view>
        <view class="cell" @click="openPolicy('privacy')">
          <text class="cell-label">隐私政策</text>
          <text class="cell-arrow">›</text>
        </view>
      </view>

      <view class="card action-card">
        <text class="group-title">数据与支持</text>
        <wd-button
          block
          type="primary"
          variant="text"
          icon="file"
          custom-class="gf-profile-action"
          open-type="feedback"
          >意见反馈</wd-button
        >
        <wd-button
          block
          type="primary"
          variant="text"
          icon="dashboard"
          custom-class="gf-profile-action"
          @click="openAnnualReport"
          >年度设备报告</wd-button
        >
        <wd-button
          block
          type="primary"
          variant="text"
          icon="storage"
          custom-class="gf-profile-action"
          @click="openBackup"
          >备份与恢复</wd-button
        >
        <wd-button
          block
          type="primary"
          variant="text"
          icon="download"
          custom-class="gf-profile-action"
          :disabled="exportingJson"
          @click="exportJson"
        >
          {{ exportingJson ? '导出中…' : '导出 JSON 数据' }}
        </wd-button>
        <text class="danger-hint"
          >导出设备、保修和维护资料，不含附件文件；分享副本由你保管，不支持直接恢复。</text
        >
      </view>
      <view class="card action-card">
        <text class="group-title">账户</text>
        <wd-button
          block
          type="primary"
          variant="text"
          icon="user"
          custom-class="gf-profile-action"
          @click="onLogout"
          >退出登录</wd-button
        >
        <wd-button
          block
          type="danger"
          variant="text"
          icon="delete"
          custom-class="gf-profile-action gf-profile-danger"
          :disabled="deleting"
          @click="onDeleteAccount"
        >
          {{ deleting ? '注销中…' : '注销账号' }}
        </wd-button>
        <text class="danger-hint">注销将删除业务数据并匿名化账号资料，无法恢复</text>
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
import { toAppError } from '@/utils/error'
import { requireCurrentConsent } from '@/services/consent'
import { useFeaturePage } from '@/composables/useFeaturePage'
import { exportAccountJson } from '@/services/phase11'

const { busy: exportingJson, action: runExport } = useFeaturePage()
function exportJson(): void {
  void runExport(exportAccountJson)
}
function openAnnualReport(): void {
  uni.navigateTo({ url: '/pages/stats/annual' })
}
function openBackup(): void {
  uni.navigateTo({ url: '/pages/profile/backup' })
}

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

onShow(() => {
  if (!requireCurrentConsent()) return
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
    content: '将清除本机登录状态、设备缓存和应用内导出文件，你的云端数据不受影响。',
    success: (res) => {
      if (res.confirm) {
        void store
          .logout()
          .then(() => {
            uni.showToast({ title: '已退出登录状态', icon: 'none' })
            setTimeout(() => uni.reLaunch({ url: '/pages/onboarding/index' }), 400)
          })
          .catch((err: unknown) => {
            uni.showToast({ title: toAppError(err).message, icon: 'none' })
            setTimeout(() => uni.reLaunch({ url: '/pages/onboarding/index' }), 800)
          })
      }
    },
  })
}

function onDeleteAccount(): void {
  uni.showModal({
    title: '注销账号',
    content: `将删除设备、保修、维护、成本、时间线及同意记录（隐私 ${PRIVACY_VERSION} / 条款 ${TERMS_VERSION}），匿名化账号资料并清理本机缓存和导出文件，无法恢复。已分享或另行保存的 CSV 副本需由你和接收者自行删除。`,
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
          uni.showToast({ title: '账号已注销', icon: 'none' })
          setTimeout(() => uni.reLaunch({ url: '/pages/home/index' }), 600)
        })
        .catch((err: unknown) => {
          uni.showToast({ title: toAppError(err).message, icon: 'none' })
          if (store.status === 'idle') {
            setTimeout(() => uni.reLaunch({ url: '/pages/onboarding/index' }), 800)
          }
        })
    },
  })
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  padding: 40rpx 32rpx calc(64rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.card {
  margin-bottom: $gf-space-md;
  padding: $gf-space-lg;
  background-color: $gf-bg-card;
  border-radius: $gf-radius-lg;
  border: 1rpx solid $gf-line;
  box-shadow: $gf-shadow-sm;
  box-sizing: border-box;
}

.profile-hero {
  padding: 40rpx;
  border: 0;
  border-radius: 30rpx;
  background: linear-gradient(135deg, #101f38, #1b436b);
  box-shadow: 0 16rpx 38rpx rgba(18, 39, 70, 0.14);
}

.profile-hero .avatar {
  background: rgba(139, 212, 247, 0.16);
}
.profile-hero .avatar-mark {
  color: #a8dcf6;
}
.profile-hero .name {
  color: #fff;
}
.profile-hero .edit-mark,
.profile-hero .user-caption {
  color: #bfd2e3;
}

.action-card {
  padding: 32rpx;
}
.group-title {
  display: block;
  margin-bottom: 12rpx;
  color: #16283e;
  font-size: 28rpx;
  font-weight: 700;
}

.user-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  min-width: 0;
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
  min-width: 0;
  flex: 1;
  margin-left: $gf-space-md;
}

.name-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: $gf-space-sm;
}

.name {
  min-width: 0;
  flex: 1;
  font-size: $gf-font-lg;
  font-weight: 600;
  line-height: 1.35;
  color: $gf-text-1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.edit-mark {
  flex-shrink: 0;
  font-size: $gf-font-xs;
  color: $gf-color-primary;
}

.user-caption {
  display: block;
  margin-top: 8rpx;
  font-size: $gf-font-xs;
  line-height: 1.4;
  color: $gf-text-3;
}

.cell {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: $gf-space-md;
  padding: $gf-space-sm 0;
}

.cell + .cell {
  border-top: 1rpx solid $gf-line;
}

.cell-label {
  min-width: 0;
  flex: 1;
  font-size: $gf-font-md;
  line-height: 1.4;
  color: $gf-text-1;
}

.cell-arrow {
  flex-shrink: 0;
  font-size: $gf-font-lg;
  line-height: 1;
  color: $gf-text-4;
}

.danger-hint {
  display: block;
  margin-top: $gf-space-xs;
  font-size: $gf-font-xs;
  line-height: 1.45;
  color: $gf-text-3;
  text-align: left;
}
</style>
