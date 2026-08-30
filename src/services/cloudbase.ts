import cloudbase from '@cloudbase/js-sdk'
import { AppError, isRecord } from '@/utils/error'

/**
 * CloudBase JS SDK v3 初始化与访问入口（PG 模式环境）。
 * 仅使用公开配置 CLOUDBASE_ENV_ID；API Key / service_role 一律不进入前端。
 */
let cloudbaseApp: ReturnType<typeof cloudbase.init> | null = null

export function getCloudbaseApp(): ReturnType<typeof cloudbase.init> {
  if (!cloudbaseApp) {
    const envId = import.meta.env.CLOUDBASE_ENV_ID
    if (!envId) {
      throw new AppError('INTERNAL_ERROR', '缺少 CLOUDBASE_ENV_ID，请检查 .env 配置')
    }
    cloudbaseApp = cloudbase.init({ env: envId })
  }
  return cloudbaseApp
}

/** 数据访问客户端（app.rdb，postgREST 风格链式 API，受服务端 RLS 约束） */
export function getRdb(): ReturnType<ReturnType<typeof cloudbase.init>['rdb']> {
  return getCloudbaseApp().rdb()
}

/** 身份认证客户端（signInWithOpenId 静默登录，无需登录页） */
export function getAuth() {
  return getCloudbaseApp().auth({ persistence: 'local' })
}

/**
 * 调用 PG RPC 函数（SECURITY DEFINER 服务端边界）。
 * 运行时 rdb 客户端支持 rpc，但 SDK 类型未声明，此处做第三方边界窄化。
 */
export async function callRpc(fn: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const client = getRdb() as unknown as {
    rpc: (name: string, args?: Record<string, unknown>) => Promise<unknown>
  }
  return client.rpc(fn, args)
}

/** app.rdb / auth 统一返回结构（SDK 判别联合的第三方边界快照） */
export interface SdkResult<TData> {
  data: TData | null
  error: { message: string; code?: string } | null
}

/** 将 SDK 返回断言为统一结果结构；字段以运行时守卫二次校验，禁止直接信任 */
export function asSdkResult<TData>(raw: unknown): SdkResult<TData> {
  if (!isRecord(raw) || !('data' in raw) || !('error' in raw)) {
    throw new AppError('INTERNAL_ERROR', 'CloudBase SDK 返回格式错误')
  }
  return raw as unknown as SdkResult<TData>
}

/** 校验 SDK 错误并转换为 AppError（docs/API.md 错误码） */
export function throwIfError(err: SdkResult<unknown>['error'], fallbackMessage?: string): void {
  if (!err) return
  if (err.code === '42501') {
    throw new AppError('FORBIDDEN', '无权访问该数据')
  }
  throw new AppError('INTERNAL_ERROR', err.message || fallbackMessage || '请求失败')
}
