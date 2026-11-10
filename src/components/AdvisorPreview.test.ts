import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AdvisorPreview from './AdvisorPreview.vue'
import type { AdvisorFacts } from '@/types/api/ai'

const facts: AdvisorFacts = {
  asOf: '2026-11-10',
  category: '电脑',
  brand: 'Example',
  model: 'M1',
  status: 'IN_USE',
  purchaseDate: null,
  warrantyEndDate: '2027-01-01',
  maintenanceCount: 2,
  knownMaintenanceCents: 1200,
  maintenanceCostUnknownCount: 1,
}

describe('advisor request consent', () => {
  it('shows the destination and selected facts before explicit confirmation', async () => {
    const view = mount(AdvisorPreview, { props: { facts, busy: false } })
    expect(view.text()).toContain('腾讯云 CloudBase')
    expect(view.text()).toContain('DeepSeek')
    expect(view.text()).toContain('未填写费用')
    expect(view.text()).toContain('序列号')
    expect(view.emitted('confirm')).toBeUndefined()
    await view.get('button').trigger('click')
    expect(view.emitted('confirm')).toHaveLength(1)
  })

  it('disables confirmation while a request is in progress', () => {
    const view = mount(AdvisorPreview, { props: { facts, busy: true } })
    expect(view.get('button').attributes('disabled')).toBeDefined()
    expect(view.text()).toContain('正在生成')
  })
})
