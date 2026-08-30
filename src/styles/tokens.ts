/**
 * 主题 Token 的 TS 常量（与 styles/variables.scss 保持一致）。
 * 供 TS 代码内联样式或逻辑判断使用；样式表请优先使用 scss 变量。
 */
export const COLORS = {
  primary: '#165dff',
  primaryWeak: '#e8f0ff',
  success: '#00b578',
  warning: '#ff8f1f',
  danger: '#f53f3f',
  text1: '#1f2329',
  text2: '#4e5969',
  text3: '#86909c',
  text4: '#c9cdd4',
  bgPage: '#f6f7f9',
  bgCard: '#ffffff',
  line: '#f0f1f3',
} as const

export const RADIUS = {
  sm: '8rpx',
  md: '16rpx',
  lg: '24rpx',
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
