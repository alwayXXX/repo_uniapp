import type { ApiSuccess } from './api/common'

/**
 * 客户端可见的 GearFlow 用户。
 * 不包含 identityId / openid 等可信身份字段（docs/DATABASE.md 4.1）。
 */
export interface GearFlowUser {
  id: string
  nickname: string | null
  avatarUrl: string | null
}

/** auth.bootstrap 响应数据（docs/API.md 3.1） */
export interface BootstrapResult {
  user: GearFlowUser & { isNewUser: boolean }
}

export type BootstrapResponse = ApiSuccess<BootstrapResult>
