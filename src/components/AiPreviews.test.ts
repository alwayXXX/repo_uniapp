import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AnnualAiPreview from './AnnualAiPreview.vue'
import ImageAiPreview from './ImageAiPreview.vue'
import type { AnnualFacts } from '@/types/api/ai'

const facts: AnnualFacts = {
  year: 2026,
  currency: 'CNY',
  deviceCount: 1,
  purchaseCount: 0,
  maintenanceCount: 0,
  disposalCount: 0,
  purchaseCents: 0,
  maintenanceCents: 0,
  disposalIncomeCents: 0,
  totalSpendCents: 0,
  netSpendCents: 0,
  months: Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    purchaseCount: 0,
    purchaseCents: 0,
    maintenanceCount: 0,
    maintenanceCents: 0,
    disposalCount: 0,
    disposalIncomeCents: 0,
  })),
}

describe('AI data previews', () => {
  it('shows annual and monthly data before explicit consent', async () => {
    const view = mount(AnnualAiPreview, { props: { facts, busy: false } })
    expect(view.text()).toContain('DeepSeek')
    expect(view.text()).toContain('12 月')
    expect(view.emitted('confirm')).toBeUndefined()
    await view.get('button').trigger('click')
    expect(view.emitted('confirm')).toHaveLength(1)
  })

  it('requires a selected image, displays its privacy warning, and disables duplicate submits', async () => {
    const view = mount(ImageAiPreview, { props: { imagePath: '', busy: false } })
    expect(view.get('button').attributes('disabled')).toBeDefined()
    expect(view.text()).toContain('序列号')
    await view.setProps({ imagePath: 'wxfile://synthetic', busy: false })
    expect(view.emitted('confirm')).toBeUndefined()
    await view.get('button').trigger('click')
    expect(view.emitted('confirm')).toHaveLength(1)
    await view.setProps({ busy: true })
    expect(view.get('button').attributes('disabled')).toBeDefined()
  })
})
