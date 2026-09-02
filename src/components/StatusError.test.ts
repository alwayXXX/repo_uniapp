import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusError from './StatusError.vue'

describe('StatusError', () => {
  it('渲染错误文案', () => {
    const wrapper = mount(StatusError, { props: { text: '网络异常' } })
    expect(wrapper.text()).toContain('网络异常')
  })

  it('retryable 时渲染重试按钮并触发 retry', async () => {
    const wrapper = mount(StatusError, { props: { text: '失败', retryable: true } })
    const button = wrapper.find('button')
    expect(button.exists()).toBe(true)
    await button.trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('retryable=false 时不渲染重试按钮', () => {
    const wrapper = mount(StatusError, { props: { text: '失败', retryable: false } })
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('loading 时重试按钮禁用', () => {
    const wrapper = mount(StatusError, {
      props: { text: '失败', retryable: true, loading: true },
    })
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })
})
