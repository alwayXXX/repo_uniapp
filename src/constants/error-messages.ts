import type { ApiErrorCode } from '@/types/api/common'

/** 面向用户的错误文案（docs/API.md 第 2 节；不含任何敏感信息） */
export const ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  UNAUTHORIZED: '身份无效，请重新进入小程序',
  VALIDATION_ERROR: '输入有误，请检查后重试',
  FORBIDDEN: '无权访问该数据',
  RESOURCE_NOT_FOUND: '数据不存在或已删除',
  DEVICE_NOT_FOUND: '设备不存在',
  CATEGORY_NOT_FOUND: '分类不存在',
  DATE_RANGE_INVALID: '日期范围错误',
  RATE_LIMITED: '操作过于频繁，请稍后重试',
  INTERNAL_ERROR: '服务暂时不可用，请稍后重试',
  IDENTITY_BOOTSTRAP_FAILED: '身份初始化失败，请稍后重试',
}
