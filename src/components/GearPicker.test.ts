import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import GearPicker from './GearPicker.vue'

describe('Wot picker adapter', () => {
  it('opens from the labeled control and closes when the picker is dismissed', async () => {
    const view = mount(GearPicker, {
      props: { range: ['全部', '电脑'] },
      slots: { default: '分类' },
    })
    const picker = view.getComponent({ name: 'WdPicker' })
    await view.get('[aria-role="button"]').trigger('click')
    expect(picker.props('visible')).toBe(true)
    picker.vm.$emit('update:visible', false)
    await view.vm.$nextTick()
    expect(picker.props('visible')).toBe(false)
  })

  it('converts a selected option to the existing index event', async () => {
    const view = mount(GearPicker, { props: { range: ['全部', '电脑'], value: 0 } })
    const picker = view.getComponent({ name: 'WdPicker' })
    picker.vm.$emit('confirm', { value: [1] })
    expect(view.emitted('change')).toEqual([[{ detail: { value: '1' } }]])
    picker.vm.$emit('confirm', { value: [3] })
    expect(view.emitted('change')).toHaveLength(1)
  })

  it('preserves date bounds and emits a local calendar date', () => {
    const view = mount(GearPicker, {
      props: { mode: 'date', value: '2026-10-28', start: '2026-10-27', end: '2026-11-01' },
    })
    const picker = view.getComponent({ name: 'WdDatetimePicker' })
    expect(picker.props('minDate')).toBe(new Date(2026, 9, 27).getTime())
    expect(picker.props('maxDate')).toBe(new Date(2026, 10, 1, 23, 59).getTime())
    picker.vm.$emit('confirm', { value: new Date(2026, 9, 29).getTime() })
    expect(view.emitted('change')).toEqual([[{ detail: { value: '2026-10-29' } }]])
  })

  it('emits only the year for a year picker', () => {
    const view = mount(GearPicker, { props: { mode: 'date', fields: 'year', value: '2026' } })
    view.getComponent({ name: 'WdDatetimePicker' }).vm.$emit('confirm', {
      value: new Date(2025, 0, 1).getTime(),
    })
    expect(view.emitted('change')).toEqual([[{ detail: { value: '2025' } }]])
  })
})
