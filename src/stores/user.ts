import { ref } from 'vue'
import { defineStore } from 'pinia'
import { fetchCurrentUser, signInSilently } from '@/services/auth'
import type { GearFlowUser } from '@/types/user'
import type { PageState } from '@/types/api/common'

/**
 * 用户 Store（Phase 1 最小实现：验证登录链路与数据库读取）。
 * 登录态、退出与注销在 Phase 3 完善（ROADMAP）。
 */
export const useUserStore = defineStore('user', () => {
  /** CloudBase 可信身份 UID（users.identity_id） */
  const identityId = ref<string | null>(null)
  /** GearFlow 用户行；服务端尚未创建时为 null（Phase 3 前置） */
  const user = ref<GearFlowUser | null>(null)
  const status = ref<PageState>('idle')

  /** 静默登录并读取当前用户；失败时抛出 AppError */
  async function bootstrap(): Promise<void> {
    status.value = 'loading'
    try {
      identityId.value = await signInSilently()
      user.value = await fetchCurrentUser()
      status.value = 'success'
    } catch (err) {
      identityId.value = null
      user.value = null
      status.value = 'error'
      throw err
    }
  }

  /** 清空客户端用户状态（auth.logout 的最小等价物） */
  function reset(): void {
    identityId.value = null
    user.value = null
    status.value = 'idle'
  }

  return { identityId, user, status, bootstrap, reset }
})
