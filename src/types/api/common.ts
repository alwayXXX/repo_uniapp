/**
 * API 通用类型（docs/API.md 第 1-2 节契约）。
 * 所有云函数响应该结构；前端据此区分成功与失败分支。
 */

/** API.md 定义的错误码 */
export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'VALIDATION_ERROR'
  | 'FORBIDDEN'
  | 'RESOURCE_NOT_FOUND'
  | 'DEVICE_NOT_FOUND'
  | 'CATEGORY_NOT_FOUND'
  | 'DATE_RANGE_INVALID'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'IDENTITY_BOOTSTRAP_FAILED'

export interface ApiErrorPayload {
  code: ApiErrorCode
  message: string
  requestId?: string
}

export interface ApiSuccess<TData> {
  success: true
  data: TData
}

export interface ApiFailure {
  success: false
  error: ApiErrorPayload
}

export type ApiResponse<TData> = ApiSuccess<TData> | ApiFailure

/** 分页参数：page 从 1 开始，pageSize 默认 20、最大 50 */
export interface PageParams {
  page: number
  pageSize: number
}

export interface PageResult<TItem> {
  items: TItem[]
  page: number
  pageSize: number
  total: number
  hasMore: boolean
}

/** 页面异步状态：所有列表与表单页面必须覆盖（AGENTS.md 状态与错误处理） */
export type PageState = 'idle' | 'loading' | 'success' | 'empty' | 'error' | 'forbidden'
