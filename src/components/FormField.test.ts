import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FormField from './FormField.vue'

describe('FormField', () => {
  it('渲染 label 与插槽内容', () => {
    const wrapper = mount(FormField, {
      props: { label: '设备名称' },
      slots: { default: '<input class="ctl" />' },
    })
    expect(wrapper.text()).toContain('设备名称')
    expect(wrapper.find('.ctl').exists()).toBe(true)
  })

  it('required 时渲染必填星号', () => {
    const wrapper = mount(FormField, { props: { label: '名称', required: true } })
    expect(wrapper.text()).toContain('*')
  })

  it('渲染错误信息并优先于 hint', () => {
    const withError = mount(FormField, {
      props: { label: '名称', error: '名称不能为空', hint: '不超过 64 字符' },
    })
    expect(withError.text()).toContain('名称不能为空')
    expect(withError.text()).not.toContain('不超过 64 字符')

    const withHint = mount(FormField, { props: { label: '名称', hint: '不超过 64 字符' } })
    expect(withHint.text()).toContain('不超过 64 字符')
  })

  it('无 label 时不渲染 label 行', () => {
    const wrapper = mount(FormField, { slots: { default: '<input />' } })
    expect(wrapper.find('.label-row').exists()).toBe(false)
  })
})
