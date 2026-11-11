import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import Home from './index.vue'

const mocks = vi.hoisted(() => ({ getDashboard: vi.fn(), onShow: () => {} }))
vi.mock('@dcloudio/uni-app', () => ({
  onShow: (callback: () => void) => {
    mocks.onShow = callback
  },
}))
vi.mock('@/services/consent', () => ({ requireCurrentConsent: () => true }))
vi.mock('@/services/dashboard', () => ({ getHomeDashboard: mocks.getDashboard }))

beforeEach(() => vi.resetAllMocks())

describe('home overview', () => {
  it('does not show zero counts when the dashboard fails to load', async () => {
    mocks.getDashboard.mockRejectedValue(new Error('offline'))
    const page = mount(Home)
    mocks.onShow()
    await flushPromises()
    expect(page.findAll('.hero-stat-value').map((item) => item.text())).toEqual(['—', '—', '—'])
  })

  it('shows actual counts after the dashboard loads', async () => {
    mocks.getDashboard.mockResolvedValue({
      deviceCount: 3,
      expiringTotal: 1,
      expiredTotal: 0,
      expiring: [],
      expired: [],
      recentMaintenances: [],
    })
    const page = mount(Home)
    mocks.onShow()
    await flushPromises()
    expect(page.findAll('.hero-stat-value').map((item) => item.text())).toEqual(['3', '1', '0'])
  })
})
