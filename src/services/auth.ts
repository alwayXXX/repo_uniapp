import { asSdkResult, callRpc, getAuth, getRdb, throwIfError } from './cloudbase'
import { AppError, isRecord } from '@/utils/error'
import type { GearFlowUser } from '@/types/user'
import type { ApiErrorCode } from '@/types/api/common'

/**
 * 身份与用户（docs/API.md 第 3-4 节，docs/DATABASE.md 9.4）。
 * 登录 = 云函数 wx-login 换自定义登录票据（OPS-7，docs/OPS7-LOGIN-DESIGN.md）；
 * bootstrap/注销 = SECURITY DEFINER RPC；
 * users 行的 INSERT 不对客户端开放，由数据库函数以 JWT 身份执行。
 */

interface UserRow {
  id: string
  identity_id: string
  nickname: string | null
  avatar_url: string | null
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

/** uni.login 获取微信临时登录凭证 code */
function getWxLoginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.login({
      provider: 'weixin',
      success: (res) => {
        const code = (res as { code?: string }).code
        if (code) {
          resolve(code)
        } else {
          reject(new AppError('UNAUTHORIZED', '微信登录凭证获取失败'))
        }
      },
      fail: () => reject(new AppError('UNAUTHORIZED', '微信登录凭证获取失败')),
    })
  })
}

/** wx-login 云函数的 HTTP 网关公网地址（无密钥公开配置；调用免鉴权路由） */
const WX_LOGIN_URL =
  'https://myrepo-d1gfju7se642a63ce-1331619055.ap-shanghai.app.tcloudbase.com/wx-login'

/** 建立微信可信身份会话，返回 CloudBase 身份 UID（即 users.identity_id） */
export async function signInSilently(): Promise<string> {
  const auth = getAuth()
  // 自包含登录通道（OPS-7）：uni.login 的 code 直接 POST 到 wx-login 公网路由，
  // 云函数用 AppSecret 换 openid 并签发自定义登录票据。openid 不回传前端。
  const code = await getWxLoginCode()
  const res = await new Promise<{ data?: unknown }>((resolve, reject) => {
    uni.request({
      url: WX_LOGIN_URL,
      method: 'POST',
      data: { code },
      timeout: 15000,
      success: resolve,
      fail: () => reject(new AppError('UNAUTHORIZED', '登录服务连接失败')),
    })
  })
  let raw: unknown = res?.data
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      throw new AppError('UNAUTHORIZED', '微信身份登录失败')
    }
  }
  const payload = raw as { ok?: boolean; ticket?: string } | null
  if (!payload || payload.ok !== true || typeof payload.ticket !== 'string') {
    throw new AppError('UNAUTHORIZED', '微信身份登录失败')
  }
  const ticket = payload.ticket
  // 清掉匿名态再做票据交换，避免会话类型冲突
  await auth.signOut()
  const rawLogin: unknown = await auth.signInWithCustomTicket(async () => ticket)
  // v3 回包可能是 {data:{session:{user:{id}}}} 或 {user:{uid}}，且可能带 error 信封
  const loginEnvelope = rawLogin as { error?: unknown; data?: unknown; user?: unknown } | null
  if (isRecord(loginEnvelope) && isRecord(loginEnvelope.error) && loginEnvelope.error !== null) {
    throw new AppError('UNAUTHORIZED', '自定义登录失败')
  }
  const nodes: unknown[] = [
    loginEnvelope?.user,
    loginEnvelope?.data,
    (auth as unknown as { currentUser?: unknown }).currentUser,
  ]
  let uid: string | undefined
  for (const node of nodes) {
    if (!isRecord(node)) continue
    for (const candidate of [
      node,
      node.user,
      node.session,
      (node.session as { user?: unknown })?.user,
    ]) {
      if (isRecord(candidate)) {
        for (const key of ['uid', 'id']) {
          if (typeof candidate[key] === 'string' && candidate[key]) {
            uid = candidate[key]
            break
          }
        }
      }
      if (uid) break
    }
    if (uid) break
  }
  if (!uid) {
    const session = asSdkResult<unknown>(await auth.getSession())
    if (isRecord(session.data) && isRecord(session.data.session)) {
      for (const key of ['uid', 'id']) {
        const node = session.data.session
        if (isRecord(node) && typeof node[key] === 'string') {
          uid = node[key]
          break
        }
        if (isRecord(node) && isRecord(node.user) && typeof node.user[key] === 'string') {
          uid = node.user[key]
          break
        }
      }
    }
  }
  if (typeof uid !== 'string' || !uid) {
    throw new AppError('UNAUTHORIZED', '会话中缺少用户标识')
  }
  return uid
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
