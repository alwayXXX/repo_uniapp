import type { WxCloudApi, WxCloudDatabaseApi } from '@/types/wx-cloud'
import type { ApiErrorCode, ApiResponse } from '@/types/api/common'
import { AppError, isRecord, toAppError } from '@/utils/error'

// #ifdef MP-WEIXIN
// wx.cloud 仅存在于微信小程序运行时；最小类型见 src/types/wx-cloud.d.ts
declare const wx: { cloud: WxCloudApi }
// #endif

let cloudInitialized = false

/** API.md 定义的合法错误码集合，用于校验云函数返回 */
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

function isApiErrorCode(value: string): value is ApiErrorCode {
  return (API_ERROR_CODES as readonly string[]).includes(value)
}

/**
 * 初始化 CloudBase（幂等）。
 * 仅使用公开配置 CLOUDBASE_ENV_ID；AppSecret 等密钥一律不进入前端。
 */
export function initCloudbase(): void {
  if (cloudInitialized) return
  const envId = import.meta.env.CLOUDBASE_ENV_ID
  if (!envId) {
    throw new AppError('INTERNAL_ERROR', '缺少 CLOUDBASE_ENV_ID，请检查 .env 配置')
  }
  wx.cloud.init({ env: envId, traceUser: true })
  cloudInitialized = true
}

/** 获取数据库引用（需先完成初始化） */
export function getDatabase(): WxCloudDatabaseApi {
  initCloudbase()
  return wx.cloud.database()
}

function isApiResponse<TData>(value: unknown): value is ApiResponse<TData> {
  if (!isRecord(value) || typeof value.success !== 'boolean') return false
  if (value.success) return true
  const error = value.error
  return isRecord(error) && typeof error.code === 'string' && typeof error.message === 'string'
}

/**
 * 调用云函数并解析统一响应（docs/API.md 第 1 节）。
 * 失败分支统一抛出 AppError，调用方只需捕获一种错误类型。
 */
export async function callCloudFunction<TData>(
  name: string,
  data: Record<string, unknown> = {},
): Promise<TData> {
  initCloudbase()
  let rawResult: unknown
  try {
    const result = await wx.cloud.callFunction({ name, data })
    rawResult = result.result
  } catch (err) {
    throw toAppError(err)
  }
  if (!isApiResponse<TData>(rawResult)) {
    throw new AppError('INTERNAL_ERROR', '云函数返回格式错误')
  }
  if (!rawResult.success) {
    const code = rawResult.error.code
    throw new AppError(isApiErrorCode(code) ? code : 'INTERNAL_ERROR', rawResult.error.message)
  }
  return rawResult.data
}
