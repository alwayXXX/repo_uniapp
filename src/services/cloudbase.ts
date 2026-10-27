import { AppError, isRecord } from '@/utils/error'
import type { ApiErrorCode } from '@/types/api/common'

interface WxCloudFunctionResult {
  result: unknown
}

interface WxCloudApi {
  init(options: { env: string; traceUser?: boolean }): void
  callFunction(options: {
    name: string
    data?: Record<string, unknown>
    timeout?: number
  }): Promise<WxCloudFunctionResult>
}

interface WxGlobal {
  cloud?: WxCloudApi
}

let initialized = false

function getWxCloud(): WxCloudApi {
  const wxApi = (globalThis as unknown as { wx?: WxGlobal }).wx
  if (!wxApi?.cloud) {
    throw new AppError('INTERNAL_ERROR', '当前运行环境不支持微信云开发')
  }
  return wxApi.cloud
}

/** 初始化当前微信小程序的 CloudBase 环境；环境 ID 是公开配置。 */
export function ensureCloudbaseInit(): void {
  if (initialized) return
  const envId = import.meta.env.CLOUDBASE_ENV_ID
  if (!envId) {
    throw new AppError('INTERNAL_ERROR', '缺少 CLOUDBASE_ENV_ID，请检查 .env 配置')
  }
  getWxCloud().init({ env: envId, traceUser: true })
  initialized = true
}

const API_ERROR_CODES: readonly ApiErrorCode[] = [
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

function throwCloudFailure(result: Record<string, unknown>): never {
  const code = typeof result.errorCode === 'string' ? result.errorCode : ''
  const appCode = (API_ERROR_CODES as readonly string[]).includes(code)
    ? (code as ApiErrorCode)
    : 'INTERNAL_ERROR'
  throw new AppError(appCode, '请求失败，请稍后重试')
}

/**
 * 调用唯一业务云函数。微信 OPENID 由云函数运行环境注入，客户端不传身份字段。
 */
export async function callGearFlowApi<T>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  ensureCloudbaseInit()
  let response: WxCloudFunctionResult
  try {
    response = await getWxCloud().callFunction({
      name: 'gearflow-api',
      data: { action, payload },
      timeout: 60000,
    })
  } catch {
    throw new AppError('INTERNAL_ERROR', '云服务连接失败，请检查网络后重试')
  }
  if (!isRecord(response.result) || typeof response.result.ok !== 'boolean') {
    throw new AppError('INTERNAL_ERROR', '云服务返回格式错误')
  }
  if (response.result.ok !== true) {
    throwCloudFailure(response.result)
  }
  return response.result.data as T
}

/** 供测试或开发验证页重置初始化状态。 */
export function resetCloudbaseInitForTests(): void {
  initialized = false
}
