import type { ApiErrorCode } from '@/types/api/common'
import { ERROR_MESSAGES } from '@/constants/error-messages'

/** 统一业务错误：携带 docs/API.md 定义的错误码，页面层据此渲染对应状态 */
export class AppError extends Error {
  readonly code: ApiErrorCode

  constructor(code: ApiErrorCode, message?: string) {
    super(message ?? ERROR_MESSAGES[code])
    this.name = 'AppError'
    this.code = code
  }
}

/** 结构化判别，替代 any 断言 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** 将 wx.cloud / 数据库原始错误转换为 AppError（docs/API.md 错误码） */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err
  if (isRecord(err) && typeof err.errMsg === 'string') {
    const message = err.errMsg
    if (/permission denied|unauthorized/i.test(message)) {
      return new AppError('FORBIDDEN')
    }
    if (/not exist|not found/i.test(message)) {
      return new AppError('RESOURCE_NOT_FOUND')
    }
    if (/env check invalid|invalid env|env.*invalid/i.test(message)) {
      return new AppError('INTERNAL_ERROR', 'CloudBase 环境不可用，请检查 CLOUDBASE_ENV_ID')
    }
    if (/fail|error/i.test(message)) {
      return new AppError('INTERNAL_ERROR', '请求失败，请检查网络后重试')
    }
  }
  return new AppError('INTERNAL_ERROR')
}
