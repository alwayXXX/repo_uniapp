/// <reference types='@dcloudio/types' />
import 'vue'

declare module '@vue/runtime-core' {
  type Hooks = App.AppInstance & Page.PageInstance

  // uni-app 模板约定：为 Vue 组件选项扩展小程序 App/Page 生命周期钩子类型，
  // 必须以接口扩展方式声明合并，空接口属第三方类型边界。
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ComponentCustomOptions extends Hooks {}
}
