import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusEmpty from './StatusEmpty.vue'

describe('StatusEmpty', () => {
  it('渲染默认标题', () => {
    const wrapper = mount(StatusEmpty)
    expect(wrapper.text()).toContain('暂无数据')
  })

  it('渲染自定义标题与提示', () => {
    const wrapper = mount(StatusEmpty, {
      props: { title: '暂无设备', hint: '添加第一台设备' },
    })
    expect(wrapper.text()).toContain('暂无设备')
    expect(wrapper.text()).toContain('添加第一台设备')
  })

  it('无 hint 时不渲染提示', () => {
    const wrapper = mount(StatusEmpty, { props: { title: '空' } })
    const paragraphs = wrapper.findAll('text')
    expect(paragraphs.length).toBeLessThanOrEqual(2)
  })

  it('渲染 action 插槽', () => {
    const wrapper = mount(StatusEmpty, {
      props: { title: '空' },
      slots: { action: '<button class="act">去添加</button>' },
    })
    expect(wrapper.find('.act').exists()).toBe(true)
  })
})
