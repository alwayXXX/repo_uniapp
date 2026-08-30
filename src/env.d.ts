/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

interface ImportMetaEnv {
  /** CloudBase 环境 ID（公开配置） */
  readonly CLOUDBASE_ENV_ID: string
  /** 应用环境：development / production */
  readonly APP_ENV: 'development' | 'production'
}
