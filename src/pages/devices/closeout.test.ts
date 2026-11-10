import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import DeviceEdit from './edit.vue'
import MaintenanceEdit from './maintenance.vue'
import DeviceDetail from './detail.vue'
import { deviceFixture, maintenanceFixture, warrantyFixture } from '@/test/fixtures'
import type { MaintenanceDoc, WarrantyDoc } from '@/types/maintenance'
import { AppError } from '@/utils/error'
import { invalidateClientRequests } from '@/services/client-state'

const mocks = vi.hoisted(() => ({
  getDevice: vi.fn(),
  getWarranty: vi.fn(),
  saveDevice: vi.fn(),
  ensureCategories: vi.fn(),
  loadFirst: vi.fn(),
  getMaintenance: vi.fn(),
  listAll: vi.fn(),
  addMaintenance: vi.fn(),
  updateMaintenance: vi.fn(),
  deleteMaintenance: vi.fn(),
  timeline: vi.fn(),
  share: vi.fn(),
  consent: vi.fn(),
  navigateTo: vi.fn(),
  chooseAiImage: vi.fn(),
  readAiImage: vi.fn(),
  requestImage: vi.fn(),
  requestAdvisor: vi.fn(),
}))
const lifecycle = vi.hoisted(() => ({
  load: (_query: Record<string, string>) => {},
  show: () => {},
}))
vi.mock('@dcloudio/uni-app', () => ({
  onHide: () => {},
  onLoad: (hook: typeof lifecycle.load) => {
    lifecycle.load = hook
  },
  onShow: (hook: typeof lifecycle.show) => {
    lifecycle.show = hook
  },
}))
vi.mock('@/services/auth', () => ({ ensureSession: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/services/consent', () => ({ requireCurrentConsent: mocks.consent }))
vi.mock('@/services/ai', () => ({
  chooseAiImage: mocks.chooseAiImage,
  readAiImage: mocks.readAiImage,
  requestImage: mocks.requestImage,
  requestAdvisor: mocks.requestAdvisor,
}))
vi.mock('@/stores/device', () => ({
  useDeviceStore: () => ({ ensureCategories: mocks.ensureCategories, loadFirst: mocks.loadFirst }),
}))
vi.mock('@/services/device', () => ({
  getDevice: mocks.getDevice,
  saveDeviceWithWarranty: mocks.saveDevice,
  softDeleteDevice: vi.fn(),
}))
vi.mock('@/services/warranty', () => ({ getWarranty: mocks.getWarranty }))
vi.mock('@/services/category', () => ({ getCategoryName: () => 'Test category' }))
vi.mock('@/services/timeline', () => ({ listDeviceTimeline: mocks.timeline }))
vi.mock('@/services/maintenance', () => ({
  getMaintenance: mocks.getMaintenance,
  listAllByDevice: mocks.listAll,
  addMaintenance: mocks.addMaintenance,
  updateMaintenance: mocks.updateMaintenance,
  deleteMaintenance: mocks.deleteMaintenance,
}))
vi.mock('@/services/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/export')>()),
  saveAndShareCsv: mocks.share,
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

enableAutoUnmount(afterEach)
beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.stubGlobal('uni', {
    showToast: vi.fn(),
    navigateBack: vi.fn(),
    navigateTo: mocks.navigateTo,
    reLaunch: vi.fn(),
  })
  mocks.consent.mockReturnValue(true)
  mocks.getDevice.mockResolvedValue({ ...deviceFixture })
  mocks.getWarranty.mockResolvedValue({ ...warrantyFixture })
  mocks.ensureCategories.mockResolvedValue([
    { id: deviceFixture.categoryId, name: 'Test category', code: 'test', sortOrder: 1 },
  ])
  mocks.saveDevice.mockResolvedValue({ id: deviceFixture.id })
  mocks.loadFirst.mockResolvedValue(undefined)
  mocks.getMaintenance.mockResolvedValue(maintenanceFixture(51))
  mocks.listAll.mockResolvedValue(Array.from({ length: 51 }, (_, i) => maintenanceFixture(i + 1)))
  mocks.timeline.mockResolvedValue({ items: [], hasMore: false })
  mocks.addMaintenance.mockResolvedValue('synthetic-new-maintenance')
  mocks.share.mockResolvedValue(undefined)
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('device editor warranty safety', () => {
  it('previews the selected picture before sending and only fills blank fields after a separate action', async () => {
    mocks.chooseAiImage.mockResolvedValue({ path: 'synthetic.jpg', size: 100 })
    mocks.readAiImage.mockReturnValue({ mimeType: 'image/jpeg', content: '/9j/AA==' })
    mocks.requestImage.mockResolvedValue({ category: 'test', brand: 'Candidate', model: 'Model' })
    const page = mount(DeviceEdit)
    lifecycle.load({})
    await flushPromises()
    const choose = page.findAll('button').find((button) => button.text().includes('选择图片识别'))
    await choose?.trigger('click')
    await flushPromises()
    expect(page.text()).toContain('确认发送图片')
    expect(mocks.requestImage).not.toHaveBeenCalled()
    await page
      .findAll('button')
      .find((button) => button.text().includes('同意并识别'))
      ?.trigger('click')
    await flushPromises()
    expect(mocks.requestImage).toHaveBeenCalledOnce()
    expect(mocks.saveDevice).not.toHaveBeenCalled()
    await page
      .findAll('button')
      .find((button) => button.text().includes('将候选填入空白项'))
      ?.trigger('click')
    expect((page.findAll('input')[1]?.element as HTMLInputElement).value).toBe('Candidate')
    expect(mocks.saveDevice).not.toHaveBeenCalled()
  })
  it('keeps the form unavailable until warranty loading finishes', async () => {
    const pending = deferred<WarrantyDoc>()
    mocks.getWarranty.mockReturnValueOnce(pending.promise)
    const page = mount(DeviceEdit)
    lifecycle.load({ id: deviceFixture.id })
    await flushPromises()
    expect(page.find('.save-button').exists()).toBe(false)
    expect(page.find('input').exists()).toBe(false)
    expect(mocks.saveDevice).not.toHaveBeenCalled()
    pending.resolve(warrantyFixture)
    await flushPromises()
    expect(page.find('.save-button').exists()).toBe(true)
  })

  it('blocks a failed warranty load, then retries and saves unrelated edits with KEEP', async () => {
    mocks.getWarranty.mockRejectedValueOnce(new AppError('INTERNAL_ERROR', 'Warranty unavailable'))
    const page = mount(DeviceEdit)
    lifecycle.load({ id: deviceFixture.id })
    await flushPromises()
    expect(page.text()).toContain('Warranty unavailable')
    expect(page.find('.save-button').exists()).toBe(false)
    expect(mocks.saveDevice).not.toHaveBeenCalled()
    await page.get('button').trigger('click')
    await flushPromises()
    await page.get('input[maxlength="64"]').setValue('Renamed device')
    await page.get('.save-button').trigger('click')
    await flushPromises()
    expect(mocks.saveDevice).toHaveBeenCalledWith(
      deviceFixture.id,
      expect.objectContaining({ name: 'Renamed device' }),
      expect.objectContaining({ mode: 'KEEP' }),
    )
  })

  it('sends CLEAR only after explicitly clearing loaded warranty fields', async () => {
    const page = mount(DeviceEdit)
    lifecycle.load({ id: deviceFixture.id })
    await flushPromises()
    await page.get('.clear-warranty').trigger('click')
    await page.get('.save-button').trigger('click')
    await flushPromises()
    expect(mocks.saveDevice).toHaveBeenCalledWith(deviceFixture.id, expect.any(Object), {
      mode: 'CLEAR',
      startDate: null,
      endDate: null,
      provider: null,
    })
  })

  it('sends SET for an intentional warranty date change', async () => {
    const page = mount(DeviceEdit)
    lifecycle.load({ id: deviceFixture.id })
    await flushPromises()
    expect(page.findAll('picker')).toHaveLength(3)
    await page.findAll('picker')[2]!.trigger('change', { detail: { value: '2028-01-01' } })
    await page.get('.save-button').trigger('click')
    await flushPromises()
    expect(mocks.saveDevice).toHaveBeenCalledWith(
      deviceFixture.id,
      expect.any(Object),
      expect.objectContaining({ mode: 'SET', endDate: '2028-01-01' }),
    )
  })

  it('preserves an unchanged legacy warranty with no start date', async () => {
    mocks.getWarranty.mockResolvedValueOnce({ ...warrantyFixture, startDate: null })
    const page = mount(DeviceEdit)
    lifecycle.load({ id: deviceFixture.id })
    await flushPromises()
    await page.get('.save-button').trigger('click')
    await flushPromises()
    expect(mocks.saveDevice).toHaveBeenCalledWith(
      deviceFixture.id,
      expect.any(Object),
      expect.objectContaining({ mode: 'KEEP' }),
    )
  })

  it('does not submit twice while a save is pending', async () => {
    const pending = deferred<{ id: string }>()
    mocks.saveDevice.mockReturnValueOnce(pending.promise)
    const page = mount(DeviceEdit)
    lifecycle.load({ id: deviceFixture.id })
    await flushPromises()
    await page.get('.save-button').trigger('click')
    await page.get('.save-button').trigger('click')
    expect(mocks.saveDevice).toHaveBeenCalledOnce()
    expect(page.get('.save-button').attributes('disabled')).toBeDefined()
    pending.resolve({ id: deviceFixture.id })
    await flushPromises()
  })
})

describe('maintenance editor', () => {
  it('loads a record directly by device and record ID', async () => {
    const page = mount(MaintenanceEdit)
    lifecycle.load({ deviceId: deviceFixture.id, id: 'synthetic-maintenance-51' })
    await flushPromises()
    expect(mocks.getMaintenance).toHaveBeenCalledWith(deviceFixture.id, 'synthetic-maintenance-51')
    expect(mocks.listAll).not.toHaveBeenCalled()
    expect((page.get('input[maxlength="64"]').element as HTMLInputElement).value).toBe(
      'Maintenance 51',
    )
  })

  it('blocks edit and delete after loading fails and allows retry', async () => {
    mocks.getMaintenance.mockRejectedValueOnce(
      new AppError('INTERNAL_ERROR', 'Maintenance unavailable'),
    )
    const page = mount(MaintenanceEdit)
    lifecycle.load({ deviceId: deviceFixture.id, id: 'synthetic-maintenance-51' })
    await flushPromises()
    expect(page.text()).toContain('Maintenance unavailable')
    expect(page.find('.save-button').exists()).toBe(false)
    expect(page.find('.delete-button').exists()).toBe(false)
    await page.get('button').trigger('click')
    await flushPromises()
    expect(page.find('.save-button').exists()).toBe(true)
  })

  it('does not show an empty editable form for a missing record', async () => {
    mocks.getMaintenance.mockResolvedValueOnce(null)
    const page = mount(MaintenanceEdit)
    lifecycle.load({ deviceId: deviceFixture.id, id: 'missing-record' })
    await flushPromises()
    expect(page.text()).toContain('维护记录不存在')
    expect(page.find('.save-button').exists()).toBe(false)
  })

  it('does not create duplicate records during or immediately after saving', async () => {
    const pending = deferred<string>()
    mocks.addMaintenance.mockReturnValueOnce(pending.promise)
    const page = mount(MaintenanceEdit)
    lifecycle.load({ deviceId: deviceFixture.id })
    await flushPromises()
    await page.get('input[maxlength="64"]').setValue('Synthetic repair')
    await page.get('.save-button').trigger('click')
    await page.get('.save-button').trigger('click')
    expect(mocks.addMaintenance).toHaveBeenCalledOnce()
    pending.resolve('synthetic-new-maintenance')
    await flushPromises()
    await page.get('.save-button').trigger('click')
    await flushPromises()
    expect(mocks.addMaintenance).toHaveBeenCalledOnce()
    expect(mocks.updateMaintenance).toHaveBeenCalledWith(
      'synthetic-new-maintenance',
      expect.any(Object),
    )
  })
})

describe('complete maintenance details', () => {
  it('shows a retryable warranty error instead of saying no warranty was entered', async () => {
    mocks.getWarranty.mockRejectedValueOnce(new AppError('INTERNAL_ERROR', 'Warranty unavailable'))
    const page = mount(DeviceDetail)
    lifecycle.load({ id: deviceFixture.id })
    lifecycle.show()
    await flushPromises()
    const warranty = page.get('.warranty-section')
    expect(warranty.text()).toContain('Warranty unavailable')
    expect(warranty.text()).not.toContain('未填写保修')
    await warranty.get('button').trigger('click')
    await flushPromises()
    expect(warranty.text()).toContain(warrantyFixture.endDate)
  })

  it('only displays an empty warranty after a successful empty response', async () => {
    mocks.getWarranty.mockResolvedValueOnce(null)
    const page = mount(DeviceDetail)
    lifecycle.load({ id: deviceFixture.id })
    lifecycle.show()
    await flushPromises()
    expect(page.get('.warranty-section').text()).toContain('未填写保修')
  })

  it('renders in batches while totaling and exporting all 51 records', async () => {
    const page = mount(DeviceDetail)
    lifecycle.load({ id: deviceFixture.id })
    lifecycle.show()
    await flushPromises()
    expect(page.findAll('.maint-row')).toHaveLength(20)
    expect(page.get('.subtotal').text()).toContain('51.00')
    await page.get('.timeline-more-button').trigger('click')
    expect(page.findAll('.maint-row')).toHaveLength(40)
    await page.get('.timeline-more-button').trigger('click')
    expect(page.findAll('.maint-row')).toHaveLength(51)
    await page.get('[data-maintenance-id="synthetic-maintenance-51"]').trigger('click')
    expect(mocks.navigateTo).toHaveBeenCalledWith({
      url: `/pages/devices/maintenance?deviceId=${deviceFixture.id}&id=synthetic-maintenance-51`,
    })
    await page.get('.maintenance-actions button').trigger('click')
    await flushPromises()
    expect(mocks.share).toHaveBeenCalledOnce()
    const csv = mocks.share.mock.calls[0]![1] as string
    expect(csv).toContain('Maintenance 51')
    expect(csv.trim().split('\r\n')).toHaveLength(52)
  })

  it('invalidates previous totals and exports immediately when details refresh', async () => {
    const page = mount(DeviceDetail)
    lifecycle.load({ id: deviceFixture.id })
    lifecycle.show()
    await flushPromises()
    expect(page.get('.subtotal').text()).toContain('51.00')
    const timeline = deferred<{ items: []; hasMore: boolean }>()
    const maintenance = deferred<MaintenanceDoc[]>()
    mocks.timeline.mockReturnValueOnce(timeline.promise)
    mocks.listAll.mockReturnValueOnce(maintenance.promise)
    lifecycle.show()
    await flushPromises()
    expect(page.find('.subtotal').exists()).toBe(false)
    expect(page.get('.maintenance-actions button').attributes('disabled')).toBeDefined()
    expect(mocks.listAll).toHaveBeenCalledTimes(2)
    timeline.resolve({ items: [], hasMore: false })
    maintenance.resolve([maintenanceFixture(60)])
    await flushPromises()
    expect(page.get('.subtotal').text()).toContain('1.00')
    expect(page.get('.maintenance-actions button').attributes('disabled')).toBeUndefined()
  })

  it('does not overwrite a newer complete list with an older response', async () => {
    const old = deferred<MaintenanceDoc[]>()
    mocks.listAll.mockReturnValueOnce(old.promise)
    const page = mount(DeviceDetail)
    lifecycle.load({ id: deviceFixture.id })
    lifecycle.show()
    await flushPromises()
    mocks.listAll.mockResolvedValueOnce([maintenanceFixture(60)])
    lifecycle.show()
    await flushPromises()
    expect(page.findAll('.maint-row')).toHaveLength(1)
    old.resolve(Array.from({ length: 51 }, (_, i) => maintenanceFixture(i + 1)))
    await flushPromises()
    expect(page.findAll('.maint-row')).toHaveLength(1)
    expect(page.get('.subtotal').text()).toContain('1.00')
    expect(page.text()).toContain('Maintenance 60')
  })

  it('does not render late maintenance or warranty responses after logout', async () => {
    const warranty = deferred<WarrantyDoc>()
    const maintenance = deferred<MaintenanceDoc[]>()
    mocks.getWarranty.mockReturnValueOnce(warranty.promise)
    mocks.listAll.mockReturnValueOnce(maintenance.promise)
    const page = mount(DeviceDetail)
    lifecycle.load({ id: deviceFixture.id })
    lifecycle.show()
    await flushPromises()
    invalidateClientRequests()
    warranty.resolve(warrantyFixture)
    maintenance.resolve([maintenanceFixture(60)])
    await flushPromises()
    expect(page.find('.subtotal').exists()).toBe(false)
    expect(page.text()).not.toContain('Maintenance 60')
    expect(page.text()).not.toContain(warrantyFixture.endDate)
  })

  it('does not expose a partial total or export after a page failure', async () => {
    mocks.listAll.mockRejectedValueOnce(new AppError('INTERNAL_ERROR', 'Later page unavailable'))
    const page = mount(DeviceDetail)
    lifecycle.load({ id: deviceFixture.id })
    lifecycle.show()
    await flushPromises()
    expect(page.text()).toContain('Later page unavailable')
    expect(page.find('.subtotal').exists()).toBe(false)
    expect(page.get('.maintenance-actions button').attributes('disabled')).toBeDefined()
    expect(mocks.share).not.toHaveBeenCalled()
    const retry = page.findAll('button').find((button) => button.text() === '重试')
    expect(retry).toBeDefined()
    await retry!.trigger('click')
    await flushPromises()
    expect(page.get('.subtotal').text()).toContain('51.00')
  })
})
