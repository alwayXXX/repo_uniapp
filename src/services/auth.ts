import { callCloudFunction } from './cloudbase'
import type { BootstrapResult } from '@/types/user'

/**
 * auth.bootstrap：云函数从可信身份上下文创建/查询 GearFlow 用户（docs/API.md 3.1）。
 * 客户端不传任何用户标识；协议同意记录在 Phase 3 引入。
 */
export function bootstrapIdentity(): Promise<BootstrapResult> {
  return callCloudFunction<BootstrapResult>('auth-bootstrap', {})
}
