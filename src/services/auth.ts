import { callGearFlowApi, ensureCloudbaseInit } from './cloudbase'
import { AppError, isRecord } from '@/utils/error'
import { hasCurrentConsent } from './consent'
import type { GearFlowUser } from '@/types/user'

/**
 * 微信小程序身份由 `wx.cloud.callFunction` 自动注入 OPENID。
 * 客户端只缓存公开用户资料，不再持有 CloudBase 自定义登录票据或 AppSecret。
 */

function readUser(value: unknown): GearFlowUser | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null
  return {
    id: value.id,
    nickname: typeof value.nickname === 'string' ? value.nickname : null,
    avatarUrl: typeof value.avatarUrl === 'string' ? value.avatarUrl : null,
  }
}

/** 初始化微信云开发；后续每次业务调用都会复用该会话。 */
export async function signInSilently(): Promise<string> {
  ensureCloudbaseInit()
  return ''
}

export async function signOut(): Promise<void> {
  // 微信原生身份没有需要失效的客户端 token。
}

/** 确保已确认当前协议，并完成 `wx.cloud` 初始化。 */
export async function ensureSession(): Promise<void> {
  if (!hasCurrentConsent()) {
    throw new AppError('UNAUTHORIZED', '请先确认最新的用户协议与隐私政策')
  }
  ensureCloudbaseInit()
}

/** 读取当前登录用户；用户资料尚未创建时返回 null。 */
export async function fetchCurrentUser(): Promise<GearFlowUser | null> {
  await ensureSession()
  const data = await callGearFlowApi<{ user: unknown }>('auth.current')
  return readUser(data.user)
}

/** auth.bootstrap：首次显式确认协议时创建用户和协议记录。 */
export async function bootstrapIdentity(
  privacyVersion: string,
  termsVersion: string,
): Promise<{ user: GearFlowUser & { isNewUser: boolean } }> {
  ensureCloudbaseInit()
  const data = await callGearFlowApi<{ user: unknown }>('auth.bootstrap', {
    privacyVersion,
    termsVersion,
  })
  const user = readUser(data.user)
  const isNewUser = isRecord(data.user) && data.user.isNewUser === true
  if (!user) {
    throw new AppError('IDENTITY_BOOTSTRAP_FAILED', '身份初始化返回格式错误')
  }
  return { user: { ...user, isNewUser } }
}

export async function updateProfile(patch: {
  nickname?: string
  avatarUrl?: string
}): Promise<void> {
  await ensureSession()
  await callGearFlowApi('auth.updateProfile', {
    nickname: patch.nickname ?? null,
    avatarUrl: patch.avatarUrl ?? null,
  })
}

export async function deleteAccount(): Promise<{ deletedAt: string | null }> {
  await ensureSession()
  const data = await callGearFlowApi<{
    status: string
    deletedAt: string | null
  }>('auth.deleteAccount')
  if (data.status !== 'DELETED') {
    throw new AppError('INTERNAL_ERROR', '注销未完成，请稍后重试')
  }
  return { deletedAt: data.deletedAt }
}
