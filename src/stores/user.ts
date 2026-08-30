import { ref } from 'vue'
import { defineStore } from 'pinia'
import { bootstrapIdentity } from '@/services/auth'
import type { GearFlowUser } from '@/types/user'
import type { PageState } from '@/types/api/common'

/**
 * 用户 Store（Phase 1 最小实现：仅验证 Pinia 与身份初始化链路）。
 * 登录态、退出与注销在 Phase 3 完善（ROADMAP）。
 */
export const useUserStore = defineStore('user', () => {
  const user = ref<GearFlowUser | null>(null)
  const isNewUser = ref(false)
  const status = ref<PageState>('idle')

  /** 调用 auth-bootstrap 建立或读取当前用户；失败时抛出 AppError */
  async function bootstrap(): Promise<void> {
    status.value = 'loading'
    try {
      const result = await bootstrapIdentity()
      user.value = {
        id: result.user.id,
        nickname: result.user.nickname,
        avatarUrl: result.user.avatarUrl,
      }
      isNewUser.value = result.user.isNewUser
      status.value = 'success'
    } catch (err) {
      user.value = null
      isNewUser.value = false
      status.value = 'error'
      throw err
    }
  }

  /** 清空客户端用户状态（auth.logout 的最小等价物） */
  function reset(): void {
    user.value = null
    isNewUser.value = false
    status.value = 'idle'
  }

  return { user, isNewUser, status, bootstrap, reset }
})
