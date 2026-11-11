import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import Stats from './index.vue'
import GearPicker from '@/components/GearPicker.vue'

const mocks = vi.hoisted(() => ({
  onShow: () => {},
  navigateTo: vi.fn(),
  overview: vi.fn(),
  categories: vi.fn(),
}))
vi.mock('@dcloudio/uni-app', () => ({
  onShow: (callback: () => void) => {
    mocks.onShow = callback
  },
}))
vi.mock('@/services/auth', () => ({ ensureSession: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/services/consent', () => ({ requireCurrentConsent: () => true }))
vi.mock('@/services/stats', () => ({ getStatisticsOverview: mocks.overview }))
vi.mock('@/services/category', () => ({ listCategories: mocks.categories }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('uni', { navigateTo: mocks.navigateTo })
  mocks.categories.mockResolvedValue([{ id: 'synthetic-category', name: '电脑' }])
  mocks.overview.mockResolvedValue({
    deviceCount: 0,
    purchaseSpendCents: 0,
    maintenanceSpendCents: 0,
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('statistics controls', () => {
  it('opens the annual report from the report card', async () => {
    const page = mount(Stats)
    await page.get('.annual-entry').trigger('click')
    expect(mocks.navigateTo).toHaveBeenCalledWith({ url: '/pages/stats/annual' })
  })

  it('retains the selected range and category when the pickers reopen', async () => {
    const page = mount(Stats)
    mocks.onShow()
    await flushPromises()
    const pickers = page.findAllComponents(GearPicker)
    expect(pickers).toHaveLength(2)
    pickers[0]!.vm.$emit('change', { detail: { value: '1' } })
    await flushPromises()
    expect(pickers[0]!.props('value')).toBe(1)
    pickers[1]!.vm.$emit('change', { detail: { value: '1' } })
    await flushPromises()
    expect(pickers[1]!.props('value')).toBe(1)
    expect(mocks.overview).toHaveBeenLastCalledWith(
      expect.objectContaining({ categoryId: 'synthetic-category' }),
    )
  })
})
