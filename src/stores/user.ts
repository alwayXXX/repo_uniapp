import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  bootstrapIdentity,
  deleteAccount as deleteAccountApi,
  signInSilently,
  updateProfile as updateProfileApi,
} from '@/services/auth'
import type { GearFlowUser } from '@/types/user'
import type { PageState } from '@/types/api/common'
import { PRIVACY_VERSION, TERMS_VERSION } from '@/constants/policies'

/**
 * 用户 Store（docs/API.md 第 3-4 节）。
 * bootstrap = 静默登录 + 身份初始化（含协议同意记录）；
 * logout = 清理客户端状态（docs/API.md 3.2，平台会话生命周期归微信/CloudBase）。
 */
export const useUserStore = defineStore('user', () => {
  /** CloudBase 可信身份 UID（users.identity_id） */
  const identityId = ref<string | null>(null)
  /** GearFlow 用户行 */
  const user = ref<GearFlowUser | null>(null)
  const isNewUser = ref(false)
  const status = ref<PageState>('idle')
  const deleting = ref(false)

  /** 静默登录并初始化身份；失败时抛出 AppError */
  async function bootstrap(): Promise<void> {
    status.value = 'loading'
    try {
      identityId.value = await signInSilently()
      const result = await bootstrapIdentity(PRIVACY_VERSION, TERMS_VERSION)
      user.value = {
        id: result.user.id,
        nickname: result.user.nickname,
        avatarUrl: result.user.avatarUrl,
      }
      isNewUser.value = result.user.isNewUser
      status.value = 'success'
    } catch (err) {
      status.value = 'error'
      throw err
    }
  }

  /** 更新昵称/头像（docs/API.md 4.2），本地同步 */
  async function updateProfile(patch: { nickname?: string; avatarUrl?: string }): Promise<void> {
    if (!user.value) {
      throw new Error('未初始化的用户')
    }
    await updateProfileApi(user.value.id, patch)
    user.value = { ...user.value, ...patch }
  }

  /** 清空客户端登录态 */
  function logout(): void {
    identityId.value = null
    user.value = null
    isNewUser.value = false
    status.value = 'idle'
  }

  /** 注销账号（docs/API.md 4.3）：确认文字校验 → 服务端删除+匿名化 → 清客户端态 */
  async function deleteAccount(confirmationText: string): Promise<void> {
    if (confirmationText !== '注销我的账号') {
      throw new Error('请输入"注销我的账号"以确认')
    }
    deleting.value = true
    try {
      await deleteAccountApi()
      logout()
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
    updateProfile,
    logout,
    deleteAccount,
  }
})
