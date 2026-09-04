<template>
  <view class="page">
    <text class="title">GearFlow · Phase 1 验证</text>
    <text class="subtitle">工程地基自检：Pinia / CloudBase / 身份 / 数据库 / 权限</text>

    <view class="card">
      <view v-for="item in checks" :key="item.key" class="check-row">
        <view class="check-head">
          <text class="check-label">{{ item.label }}</text>
          <text class="check-state" :class="item.state">{{ stateText(item.state) }}</text>
        </view>
        <text v-if="item.message" class="check-message">{{ item.message }}</text>
      </view>
    </view>

    <button class="run-button" :disabled="running" @click="runAllChecks">
      {{ running ? '验证中…' : '运行验证' }}
    </button>

    <view class="note">
      <text class="note-title">权限隔离验证说明</text>
      <text class="note-line"
        >· 归属列 user_id 由数据库 DEFAULT auth.uid() 写入，客户端不可指定。</text
      >
      <text class="note-line"
        >· 数据层为 CloudBase PostgreSQL，行级安全（RLS）策略强制 user_id = auth.uid()。</text
      >
      <text class="note-line">
        · 隔离验证：在微信开发者工具中用账号 A 运行验证，再用账号
        B（多账号调试）运行，确认互相看不到对方设备数据。
      </text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useUserStore } from '@/stores/user'
import { getCloudbaseApp } from '@/services/cloudbase'
import {
  createDevice,
  getDevice,
  listDevices,
  softDeleteDevice,
  updateDevice,
} from '@/services/device'
import { listCategories } from '@/services/category'
import { AppError, toAppError } from '@/utils/error'
import type { PageState } from '@/types/api/common'

interface CheckItem {
  key: string
  label: string
  state: PageState
  message: string
}

const userStore = useUserStore()
const running = ref(false)

const checks = reactive<CheckItem[]>([
  { key: 'pinia', label: 'Pinia Store', state: 'idle', message: '' },
  { key: 'cloudbase', label: 'CloudBase 初始化', state: 'idle', message: '' },
  { key: 'identity', label: '身份验证（CloudBase RPC）', state: 'idle', message: '' },
  { key: 'database', label: '数据库读写（devices）', state: 'idle', message: '' },
])

function findCheck(key: string): CheckItem {
  const check = checks.find((item) => item.key === key)
  if (!check) {
    throw new AppError('INTERNAL_ERROR', `未知验证项：${key}`)
  }
  return check
}

function failCheck(key: string, err: unknown): void {
  const check = findCheck(key)
  const appError = toAppError(err)
  check.state = appError.code === 'FORBIDDEN' ? 'forbidden' : 'error'
  check.message = `${appError.code}: ${appError.message}`
}

function stateText(state: PageState): string {
  switch (state) {
    case 'idle':
      return '待执行'
    case 'loading':
      return '进行中'
    case 'success':
      return '通过'
    case 'error':
      return '失败'
    case 'empty':
      return '空数据'
    case 'forbidden':
      return '无权限'
  }
}

async function checkPinia(): Promise<void> {
  const check = findCheck('pinia')
  check.state = 'loading'
  try {
    await userStore.logout()
    check.message = `store=${userStore.$id}，初始状态=${userStore.status}`
    check.state = 'success'
  } catch (err) {
    failCheck('pinia', err)
  }
}

async function checkCloudbase(): Promise<void> {
  const check = findCheck('cloudbase')
  check.state = 'loading'
  try {
    getCloudbaseApp()
    check.message = `env=${import.meta.env.CLOUDBASE_ENV_ID}，appEnv=${import.meta.env.APP_ENV}`
    check.state = 'success'
  } catch (err) {
    failCheck('cloudbase', err)
  }
}

async function checkIdentity(): Promise<void> {
  const check = findCheck('identity')
  check.state = 'loading'
  try {
    await userStore.bootstrap()
    const userNote = userStore.user ? '用户行已读取' : '用户行待服务端创建（Phase 3）'
    check.message = `可信会话已建立，${userNote}`
    check.state = 'success'
  } catch (err) {
    failCheck('identity', err)
  }
}

async function checkDatabase(): Promise<void> {
  const check = findCheck('database')
  check.state = 'loading'
  try {
    const categories = await listCategories()
    const category = categories[0]
    if (!category) {
      throw new AppError('CATEGORY_NOT_FOUND', '系统分类未初始化')
    }
    const stamp = new Date().toISOString().slice(11, 19)
    const createdId = await createDevice({
      categoryId: category.id,
      name: `验证设备 ${stamp}`,
      status: 'IN_USE',
      brand: null,
      model: null,
      serialNumber: null,
      purchaseDate: null,
      purchaseChannel: null,
      purchasePriceCents: null,
      notes: null,
    })

    let devices = await listDevices({
      sortBy: 'createdAt',
      sortOrder: 'desc',
      page: 1,
      pageSize: 20,
    })
    if (!devices.items.some((doc) => doc.id === createdId)) {
      throw new AppError('RESOURCE_NOT_FOUND', '创建后读取不到该设备')
    }

    const renamed = `验证设备-已更新 ${stamp}`
    await updateDevice(createdId, {
      categoryId: category.id,
      name: renamed,
      status: 'IN_USE',
      brand: null,
      model: null,
      serialNumber: null,
      purchaseDate: null,
      purchaseChannel: null,
      purchasePriceCents: null,
      notes: null,
    })
    devices = await listDevices({
      sortBy: 'createdAt',
      sortOrder: 'desc',
      page: 1,
      pageSize: 20,
    })
    if (!devices.items.some((doc) => doc.id === createdId && doc.name === renamed)) {
      throw new AppError('VALIDATION_ERROR', '更新后读取结果不正确')
    }

    await softDeleteDevice(createdId)
    devices = await listDevices({
      sortBy: 'createdAt',
      sortOrder: 'desc',
      page: 1,
      pageSize: 20,
    })
    if (devices.items.some((doc) => doc.id === createdId)) {
      throw new AppError('INTERNAL_ERROR', '删除后仍然能读取到该设备')
    }
    const removed = await getDevice(createdId)
    if (removed !== null) {
      throw new AppError('INTERNAL_ERROR', '软删除后单查仍可见')
    }

    check.message = `创建 / 读取 / 更新 / 软删除 / 单查 全部通过`
    check.state = 'success'
  } catch (err) {
    failCheck('database', err)
  }
}

async function runAllChecks(): Promise<void> {
  if (running.value) return
  running.value = true
  checks.forEach((check) => {
    check.state = 'idle'
    check.message = ''
  })

  await checkPinia()
  await checkCloudbase()
  await checkIdentity()
  await checkDatabase()

  running.value = false
}
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  padding: 40rpx 32rpx 64rpx;
}

.title {
  font-size: 40rpx;
  font-weight: 600;
}

.subtitle {
  margin-top: 12rpx;
  font-size: 24rpx;
  color: #86909c;
}

.card {
  margin-top: 32rpx;
  padding: 8rpx 24rpx;
  background-color: #ffffff;
  border-radius: 16rpx;
}

.check-row {
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f0f1f3;
}

.check-row:last-child {
  border-bottom: none;
}

.check-head {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.check-label {
  font-size: 28rpx;
}

.check-state {
  font-size: 24rpx;
  color: #86909c;
}

.check-state.success {
  color: #00b578;
}

.check-state.error,
.check-state.forbidden {
  color: #f53f3f;
}

.check-state.loading {
  color: #165dff;
}

.check-message {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #86909c;
  word-break: break-all;
}

.run-button {
  margin-top: 40rpx;
  background-color: #165dff;
  color: #ffffff;
}

.note {
  margin-top: 48rpx;
  padding: 24rpx;
  background-color: #ffffff;
  border-radius: 16rpx;
  display: flex;
  flex-direction: column;
}

.note-title {
  font-size: 26rpx;
  font-weight: 600;
  margin-bottom: 12rpx;
}

.note-line {
  font-size: 22rpx;
  color: #86909c;
  line-height: 1.6;
}
</style>
