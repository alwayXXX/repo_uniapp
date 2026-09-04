import { asSdkResult, callRpc, getAuth, getRdb, throwIfError } from './cloudbase'
import { AppError, isRecord } from '@/utils/error'
import type { GearFlowUser } from '@/types/user'
import type { ApiErrorCode } from '@/types/api/common'

/**
 * 身份与用户（docs/API.md 第 3-4 节，docs/DATABASE.md 9.4）。
 * 登录 = signInWithOpenId 静默登录；bootstrap/注销 = SECURITY DEFINER RPC；
 * users 行的 INSERT 不对客户端开放，由数据库函数以 JWT 身份执行。
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

const RPC_ERROR_CODES: readonly ApiErrorCode[] = [
  'UNAUTHORIZED',
  'VALIDATION_ERROR',
  'FORBIDDEN',
  'RESOURCE_NOT_FOUND',
  'DEVICE_NOT_FOUND',
  'CATEGORY_NOT_FOUND',
  'DATE_RANGE_INVALID',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'IDENTITY_BOOTSTRAP_FAILED',
]

function throwRpcFailure(data: unknown, fallbackMessage: string): never {
  const code = isRecord(data) && typeof data.errorCode === 'string' ? data.errorCode : ''
  const appCode = (RPC_ERROR_CODES as readonly string[]).includes(code)
    ? (code as ApiErrorCode)
    : 'INTERNAL_ERROR'
  throw new AppError(appCode, fallbackMessage)
}

/** 建立微信可信身份会话，返回 CloudBase 身份 UID（即 users.identity_id） */
export async function signInSilently(): Promise<string> {
  const auth = getAuth()
  const signInResult = asSdkResult<unknown>(await auth.signInWithOpenId())
  throwIfError(signInResult.error, '微信身份登录失败')
  return parseUid(signInResult)
}

/** 结束本机持久化 CloudBase 会话。 */
export async function signOut(): Promise<void> {
  await getAuth().signOut()
}

/**
 * 确保存在有效会话（幂等）：访问令牌有效期约 2 小时，
 * 冷启动恢复的过期会话由这里静默续期，避免各页面各自处理 401。
 */
export async function ensureSession(): Promise<void> {
  const auth = getAuth()
  const result = asSdkResult<unknown>(await auth.getSession())
  if (!isRecord(result.data) || !isRecord(result.data.session)) {
    await signInSilently()
  }
}

function toGearFlowUser(row: UserRow): GearFlowUser {
  return { id: row.id, nickname: row.nickname, avatarUrl: row.avatar_url }
}

/** 读取当前登录用户；用户行尚未创建时返回 null */
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

/** auth.bootstrap（docs/API.md 3.1）：RPC upsert 用户行并按版本记录协议同意 */
export async function bootstrapIdentity(
  privacyVersion: string,
  termsVersion: string,
): Promise<{ user: GearFlowUser & { isNewUser: boolean } }> {
  const result = asSdkResult<unknown>(
    await callRpc('gf_bootstrap_user', { p_privacy: privacyVersion, p_terms: termsVersion }),
  )
  throwIfError(result.error, '身份初始化失败')
  const data = result.data
  if (!isRecord(data) || !isRecord(data.user)) {
    throw new AppError('IDENTITY_BOOTSTRAP_FAILED', '身份初始化返回格式错误')
  }
  const user = data.user
  if (typeof user.id !== 'string') {
    throw new AppError('IDENTITY_BOOTSTRAP_FAILED', '身份初始化缺少用户标识')
  }
  return {
    user: {
      id: user.id,
      nickname: typeof user.nickname === 'string' ? user.nickname : null,
      avatarUrl: typeof user.avatarUrl === 'string' ? user.avatarUrl : null,
      isNewUser: user.isNewUser === true,
    },
  }
}

/** user.updateProfile（docs/API.md 4.2）：通过服务端 RPC 更新当前身份。 */
export async function updateProfile(patch: {
  nickname?: string
  avatarUrl?: string
}): Promise<void> {
  await ensureSession()
  const result = asSdkResult<unknown>(
    await callRpc('gf_update_profile', {
      p_nickname: patch.nickname ?? null,
      p_avatar_url: patch.avatarUrl ?? null,
    }),
  )
  throwIfError(result.error, '更新资料失败')
  const data = result.data
  if (!isRecord(data) || data.ok !== true) {
    return throwRpcFailure(data, '更新资料失败，请稍后重试')
  }
}

/** user.deleteAccount（docs/API.md 4.3）：RPC 删除业务数据并匿名化用户行 */
export async function deleteAccount(): Promise<{ deletedAt: string | null }> {
  await ensureSession()
  const result = asSdkResult<unknown>(await callRpc('gf_delete_account'))
  throwIfError(result.error, '注销失败')
  const data = result.data
  const status = isRecord(data) && typeof data.status === 'string' ? data.status : ''
  if (status !== 'DELETED') {
    throw new AppError('INTERNAL_ERROR', '注销未完成，请稍后重试')
  }
  const deletedAt = isRecord(data) && typeof data.deletedAt === 'string' ? data.deletedAt : null
  return { deletedAt }
}
