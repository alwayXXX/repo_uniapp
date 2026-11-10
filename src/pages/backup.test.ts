import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import BackupPage from './profile/backup.vue'
import {
  chooseAccountBackup,
  previewAccountRestore,
  restoreAccountBackup,
  shareAccountBackup,
} from '@/services/backup'
import type { BackupBundle } from '@/types/api/backup'

const hooks = vi.hoisted(() => ({
  shows: [] as Array<() => void>,
  unloads: [] as Array<() => void>,
}))
vi.mock('@dcloudio/uni-app', () => ({
  onShow: (callback: () => void) => hooks.shows.push(callback),
  onUnload: (callback: () => void) => hooks.unloads.push(callback),
}))
vi.mock('@/services/consent', () => ({ requireCurrentConsent: () => true }))
vi.mock('@/services/backup', () => ({
  chooseAccountBackup: vi.fn(),
  previewAccountRestore: vi.fn(),
  restoreAccountBackup: vi.fn(),
  shareAccountBackup: vi.fn(),
}))

const sample = {
  format: 'gearflow-backup',
  version: 2,
  createdAt: '2026-11-10T00:00:00Z',
  checksum: 'test',
  snapshot: {
    devices: [{ id: 'device', name: '测试设备' }],
    warranties: [],
    maintenances: [],
    timelines: [],
    categories: [],
    attachments: [],
  },
  files: [],
} as BackupBundle

beforeEach(() => {
  vi.clearAllMocks()
  hooks.shows.length = 0
  hooks.unloads.length = 0
  vi.stubGlobal('uni', { showModal: vi.fn() })
})

describe('backup page safeguards', () => {
  it('previews a selected file and requires a separate confirmation before restore', async () => {
    vi.mocked(chooseAccountBackup).mockResolvedValue(sample)
    vi.mocked(previewAccountRestore).mockResolvedValue([{ id: 'device', state: 'create' }])
    vi.mocked(restoreAccountBackup).mockResolvedValue({
      devices: 1,
      skipped: 0,
      conflicts: 0,
      records: 0,
    })
    const page = mount(BackupPage)
    await page
      .findAll('button')
      .find((button) => button.text().includes('选择备份文件'))
      ?.trigger('click')
    await flushPromises()
    expect(page.text()).toContain('可新增 1 台')
    expect(restoreAccountBackup).not.toHaveBeenCalled()
    await page
      .findAll('button')
      .find((button) => button.text().includes('确认恢复'))
      ?.trigger('click')
    expect(restoreAccountBackup).not.toHaveBeenCalled()
    const modal = vi.mocked(uni.showModal).mock.calls[0]?.[0]
    modal?.success?.({ confirm: true, cancel: false })
    await flushPromises()
    expect(restoreAccountBackup).toHaveBeenCalledOnce()
    page.unmount()
  })

  it('does not export a sensitive file when the user cancels', async () => {
    const page = mount(BackupPage)
    await page
      .findAll('button')
      .find((button) => button.text().includes('生成并分享'))
      ?.trigger('click')
    const modal = vi.mocked(uni.showModal).mock.calls[0]?.[0]
    modal?.success?.({ confirm: false, cancel: true })
    await flushPromises()
    expect(shareAccountBackup).not.toHaveBeenCalled()
    page.unmount()
  })
})
