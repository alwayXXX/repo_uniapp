import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { Component } from 'vue'
import Annual from './stats/annual.vue'
import Dispose from './devices/dispose.vue'
import Attachments from './devices/attachments.vue'
import Reminders from './devices/reminders.vue'
import { getDevice } from '@/services/device'
import { getWarranty } from '@/services/warranty'
import {
  getAnnualReport,
  getReminderConfig,
  listAttachments,
  listReminders,
  disposeDevice,
} from '@/services/phase11'

const hooks = vi.hoisted(() => ({
  shows: [] as Array<() => void>,
  loads: [] as Array<(query: Record<string, string>) => void>,
}))
vi.mock('@dcloudio/uni-app', () => ({
  onShow: (callback: () => void) => hooks.shows.push(callback),
  onLoad: (callback: (query: Record<string, string>) => void) => hooks.loads.push(callback),
}))
vi.mock('@/services/consent', () => ({ requireCurrentConsent: () => true }))
vi.mock('@/services/device', () => ({ getDevice: vi.fn() }))
vi.mock('@/services/warranty', () => ({ getWarranty: vi.fn() }))
vi.mock('@/services/phase11', () => ({
  getAnnualReport: vi.fn(),
  disposeDevice: vi.fn(),
  getReminderConfig: vi.fn(),
  listAttachments: vi.fn(),
  listReminders: vi.fn(),
  chooseAndUploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
  openAttachment: vi.fn(),
  cancelReminder: vi.fn(),
  subscribeReminder: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  hooks.shows.length = 0
  hooks.loads.length = 0
  vi.stubGlobal('uni', { showToast: vi.fn(), showModal: vi.fn(), navigateBack: vi.fn() })
  vi.mocked(getDevice).mockResolvedValue({
    id: 'device',
    userId: null,
    categoryId: null,
    name: 'Synthetic device',
    status: 'IN_USE',
    brand: null,
    model: null,
    serialNumber: null,
    purchaseDate: '2026-01-01',
    purchaseChannel: null,
    purchasePriceCents: null,
    currency: 'CNY',
    notes: null,
    deletedAt: null,
    createdAt: '',
    updatedAt: '',
  })
  vi.mocked(listAttachments).mockResolvedValue([])
  vi.mocked(listReminders).mockResolvedValue([])
  vi.mocked(getReminderConfig).mockResolvedValue({ available: false, templateId: null })
  vi.mocked(getWarranty).mockResolvedValue(null)
})

async function render(component: Component) {
  const wrapper = mount(component)
  hooks.loads.forEach((callback) => callback({ deviceId: 'device' }))
  hooks.shows.forEach((callback) => callback())
  await flushPromises()
  return wrapper
}

describe('P11 page flows', () => {
  it('shows a usable empty annual report with all twelve months', async () => {
    const year = new Date().getFullYear()
    vi.mocked(getAnnualReport).mockResolvedValue({
      year,
      currency: 'CNY',
      deviceCount: 0,
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
    })
    const page = await render(Annual)
    expect(page.text()).toContain('这一年暂无')
    expect(page.findAll('.month-row')).toHaveLength(12)
    page.unmount()
  })
  it('renders annual report errors and supports retry', async () => {
    vi.mocked(getAnnualReport).mockRejectedValue(new Error('offline'))
    const page = await render(Annual)
    expect(page.text()).toContain('重试')
    const retry = page.findAll('button').find((button) => button.text().includes('重试'))
    await retry?.trigger('click')
    await flushPromises()
    expect(getAnnualReport).toHaveBeenCalledTimes(2)
    page.unmount()
  })
  it('allows adding attachments from an empty list and shows privacy purpose before selection', async () => {
    const page = await render(Attachments)
    expect(page.text()).toContain('仅供本人查阅')
    expect(page.text()).toContain('还没有附件')
    expect(page.find('button.primary').attributes('disabled')).toBeUndefined()
    page.unmount()
  })
  it('blocks subscription when a platform template is unavailable', async () => {
    const page = await render(Reminders)
    expect(page.text()).toContain('订阅模板尚未配置')
    expect(page.find('button.primary').attributes('disabled')).toBeDefined()
    page.unmount()
  })
  it('validates disposal amounts before making a write request', async () => {
    const page = await render(Dispose)
    await page.find('input').setValue('-1')
    await page.find('button.primary').trigger('click')
    expect(page.text()).toContain('请检查日期和收入金额')
    expect(disposeDevice).not.toHaveBeenCalled()
    page.unmount()
  })
})
