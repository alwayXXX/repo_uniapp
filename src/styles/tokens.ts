/**
 * 主题 Token 的 TS 常量（与 styles/variables.scss 保持一致）。
 * 供 TS 代码内联样式或逻辑判断使用；样式表请优先使用 scss 变量。
 */
export const COLORS = {
  primary: '#1a73e8',
  primaryWeak: '#e8f0fe',
  primaryStrong: '#185abc',
  success: '#188038',
  successWeak: '#e6f4ea',
  warning: '#b06000',
  warningWeak: '#fef7e0',
  danger: '#d93025',
  dangerWeak: '#fce8e6',
  text1: '#202124',
  text2: '#5f6368',
  text3: '#80868b',
  text4: '#bdc1c6',
  bgPage: '#f8f9fa',
  bgCard: '#ffffff',
  bgSubtle: '#f1f3f4',
  line: '#dadce0',
} as const

export const RADIUS = {
  sm: '8rpx',
  md: '12rpx',
  lg: '16rpx',
} as const

export const SPACE = {
  xs: '8rpx',
  sm: '16rpx',
  md: '24rpx',
  lg: '32rpx',
  xl: '48rpx',
} as const

export const FONT = {
  xs: '22rpx',
  sm: '24rpx',
  md: '28rpx',
  lg: '32rpx',
  xl: '40rpx',
} as const

export const SHADOW = {
  sm: '0 2rpx 10rpx rgba(32, 33, 36, 0.06)',
} as const
