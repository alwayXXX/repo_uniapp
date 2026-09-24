import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  bootstrapIdentity,
  fetchCurrentUser,
  deleteAccount as deleteAccountApi,
  signInSilently,
  signOut as signOutApi,
  updateProfile as updateProfileApi,
} from '@/services/auth'
import type { GearFlowUser } from '@/types/user'
import type { PageState } from '@/types/api/common'
import { PRIVACY_VERSION, TERMS_VERSION } from '@/constants/policies'
import { useDeviceStore } from './device'
import { clearGeneratedExports } from '@/services/export'
import { clearConsent, hasCurrentConsent, saveCurrentConsent } from '@/services/consent'
import {
  assertClientRevision,
  clientRevision,
  invalidateClientRequests,
} from '@/services/client-state'
import { AppError } from '@/utils/error'

/**
 * 用户 Store（docs/API.md 第 3-4 节）。
 * bootstrap restores an existing user; acceptPolicies alone records consent.
 * logout = 结束 CloudBase 持久化会话并清理客户端状态（docs/API.md 3.2）。
 */
export const useUserStore = defineStore('user', () => {
  /** CloudBase 可信身份 UID（users.identity_id） */
  const identityId = ref<string | null>(null)
  /** GearFlow 用户行 */
  const user = ref<GearFlowUser | null>(null)
  const isNewUser = ref(false)
  const status = ref<PageState>('idle')
  const deleting = ref(false)

  let initialization: Promise<void> | null = null

  async function initialize(accepting: boolean): Promise<void> {
    const revision = clientRevision()
    status.value = 'loading'
    try {
      clearGeneratedExports()
      const identity = await signInSilently()
      assertClientRevision(revision)
      const current = accepting
        ? (await bootstrapIdentity(PRIVACY_VERSION, TERMS_VERSION)).user
        : await fetchCurrentUser()
      assertClientRevision(revision)
      if (!current) {
        clearConsent()
        uni.reLaunch({ url: '/pages/onboarding/index' })
        throw new AppError('UNAUTHORIZED', '账号已失效，请重新确认协议')
      }
      if (accepting) saveCurrentConsent()
      identityId.value = identity
      user.value = { id: current.id, nickname: current.nickname, avatarUrl: current.avatarUrl }
      isNewUser.value = 'isNewUser' in current && current.isNewUser === true
      status.value = 'success'
    } catch (err) {
      if (revision === clientRevision()) status.value = 'error'
      throw err
    }
  }

  function startInitialization(accepting: boolean): Promise<void> {
    if (initialization) return initialization
    const task = initialize(accepting).finally(() => {
      if (initialization === task) initialization = null
    })
    initialization = task
    return task
  }

  function bootstrap(): Promise<void> {
    if (!hasCurrentConsent()) {
      return Promise.reject(new AppError('UNAUTHORIZED', '请先确认最新协议'))
    }
    return startInitialization(false)
  }

  function acceptPolicies(): Promise<void> {
    return startInitialization(true)
  }

  /** 更新昵称/头像（docs/API.md 4.2），本地同步 */
  async function updateProfile(patch: { nickname?: string; avatarUrl?: string }): Promise<void> {
    const revision = clientRevision()
    if (!user.value) {
      throw new Error('未初始化的用户')
    }
    const nextPatch = {
      nickname: patch.nickname ?? user.value.nickname ?? '',
      avatarUrl: patch.avatarUrl ?? user.value.avatarUrl ?? '',
    }
    await updateProfileApi(nextPatch)
    assertClientRevision(revision)
    user.value = { ...user.value, ...patch }
  }

  function clearClientState(): void {
    invalidateClientRequests()
    initialization = null
    identityId.value = null
    user.value = null
    isNewUser.value = false
    status.value = 'idle'
    useDeviceStore().reset()
    clearConsent()
    uni.removeStorageSync('gf_stats_category_id')
  }

  /** Clear cached data even when the SDK cannot complete sign-out. */
  async function logout(): Promise<void> {
    clearClientState()
    try {
      clearGeneratedExports()
    } finally {
      await signOutApi()
    }
  }

  /** 注销账号（docs/API.md 4.3）：确认文字校验 → 服务端删除+匿名化 → 清客户端态 */
  async function deleteAccount(confirmationText: string): Promise<void> {
    if (deleting.value) return
    if (confirmationText !== '注销我的账号') {
      throw new Error('请输入"注销我的账号"以确认')
    }
    deleting.value = true
    try {
      invalidateClientRequests()
      clearGeneratedExports()
      await deleteAccountApi()
      try {
        await logout()
      } catch {
        throw new AppError('INTERNAL_ERROR', '云端数据已注销，本机清理未完成，请重新进入后重试')
      }
    } finally {
      deleting.value = false
    }
  }

  return {
    identityId,
    user,
    isNewUser,
    status,
    deleting,
    bootstrap,
    acceptPolicies,
    updateProfile,
    logout,
    deleteAccount,
  }
})
