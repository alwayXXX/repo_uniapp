import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusView from './StatusView.vue'

describe('StatusView', () => {
  it('loading 态渲染加载文案', () => {
    const wrapper = mount(StatusView, { props: { state: 'loading' } })
    expect(wrapper.text()).toContain('加载中…')
  })

  it('empty 态渲染空标题与提示', () => {
    const wrapper = mount(StatusView, {
      props: { state: 'empty', emptyTitle: '暂无设备', emptyHint: '添加第一台' },
    })
    expect(wrapper.text()).toContain('暂无设备')
    expect(wrapper.text()).toContain('添加第一台')
  })

  it('error 态渲染错误文案与重试按钮，点击触发 retry', async () => {
    const wrapper = mount(StatusView, {
      props: { state: 'error', errorText: '网络异常' },
    })
    expect(wrapper.text()).toContain('网络异常')
    const retry = wrapper.find('button')
    expect(retry.exists()).toBe(true)
    await retry.trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('forbidden 态渲染无权限文案', () => {
    const wrapper = mount(StatusView, { props: { state: 'forbidden' } })
    expect(wrapper.text()).toContain('无权访问该数据')
  })

  it('success 态渲染默认插槽内容', () => {
    const wrapper = mount(StatusView, {
      props: { state: 'success' },
      slots: { default: '<view class="content">业务内容</view>' },
    })
    expect(wrapper.text()).toContain('业务内容')
  })

  it('idle 态渲染默认插槽内容', () => {
    const wrapper = mount(StatusView, {
      props: { state: 'idle' },
      slots: { default: '<view class="content">待机内容</view>' },
    })
    expect(wrapper.text()).toContain('待机内容')
  })
})
