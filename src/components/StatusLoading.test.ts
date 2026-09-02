import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusLoading from './StatusLoading.vue'

describe('StatusLoading', () => {
  it('渲染默认文案', () => {
    const wrapper = mount(StatusLoading)
    expect(wrapper.text()).toContain('加载中…')
  })

  it('渲染自定义文案', () => {
    const wrapper = mount(StatusLoading, { props: { text: '正在同步设备…' } })
    expect(wrapper.text()).toContain('正在同步设备…')
  })
})
