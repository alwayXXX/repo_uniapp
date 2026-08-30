import { asSdkResult, getAuth, getRdb, throwIfError } from './cloudbase'
import { AppError, isRecord } from '@/utils/error'
import type { GearFlowUser } from '@/types/user'

/**
 * 身份与当前用户（docs/ARCHITECTURE.md 身份与权限）。
 * 登录使用 CloudBase 静默登录 signInWithOpenId，无需登录页；
 * users 行的创建由服务端边界负责（docs/DATABASE.md 9.1），客户端只读取。
 */

interface UserRow {
  id: string
  identity_id: string
  nickname: string | null
  avatar_url: string | null
}

function parseUid(raw: unknown): string {
  if (!isRecord(raw) || !isRecord(raw.data)) {
    throw new AppError('UNAUTHORIZED', '微信身份登录失败')
  }
  const data = raw.data
  const candidates = [data.session, data.user]
  for (const node of candidates) {
    if (isRecord(node) && isRecord(node.user) && typeof node.user.id === 'string') {
      return node.user.id
    }
    if (isRecord(node) && typeof node.id === 'string') {
      return node.id
    }
  }
  throw new AppError('UNAUTHORIZED', '会话中缺少用户标识')
}

/** 建立微信可信身份会话，返回 CloudBase 身份 UID（即 users.identity_id） */
export async function signInSilently(): Promise<string> {
  const auth = getAuth()
  // 非 wx.cloud 通道：走 CloudBase 认证服务的 HTTP 路径，会话令牌在 HTTP 网关上映射为
  // authenticated 角色，使 RLS 按设计生效（wx.cloud 通道会以特权上下文执行、绕过 RLS）
  const signInResult = asSdkResult<unknown>(await auth.signInWithOpenId({ useWxCloud: false }))
  throwIfError(signInResult.error, '微信身份登录失败')
  return parseUid(signInResult)
}

function toGearFlowUser(row: UserRow): GearFlowUser {
  return { id: row.id, nickname: row.nickname, avatarUrl: row.avatar_url }
}

/** 读取当前登录用户；用户行尚未由服务端创建时返回 null（Phase 3 前置） */
export async function fetchCurrentUser(): Promise<GearFlowUser | null> {
  const rdb = getRdb()
  const result = asSdkResult<unknown>(await rdb.from('users').select('*').limit(1))
  throwIfError(result.error, '读取用户失败')
  if (!Array.isArray(result.data) || result.data.length === 0) {
    return null
  }
  const first = result.data[0]
  if (!isRecord(first) || typeof first.id !== 'string' || typeof first.identity_id !== 'string') {
    throw new AppError('INTERNAL_ERROR', '用户数据格式错误')
  }
  return toGearFlowUser(first as unknown as UserRow)
}
