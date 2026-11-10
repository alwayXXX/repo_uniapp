import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  chooseAccountBackup,
  createAccountBackup,
  previewAccountRestore,
  restoreAccountBackup,
} from './backup'
import { phase11Request } from './phase11'
import { invalidateClientRequests } from './client-state'
import { createBackup, parseBackup } from '@/utils/backup'

vi.mock('./phase11', () => ({ phase11Request: vi.fn() }))

function snapshot() {
  const createdAt = '2026-11-10T00:00:00Z'
  return {
    devices: [
      {
        id: 'dev-1',
        name: '测试设备',
        status: 'IN_USE',
        categoryId: null,
        deletedAt: null,
        currency: 'CNY',
        createdAt,
        updatedAt: createdAt,
      },
    ],
    warranties: [],
    maintenances: [],
    timelines: [],
    categories: [],
    attachments: [
      {
        id: 'image-1',
        deviceId: 'dev-1',
        name: 'image.png',
        mimeType: 'image/png',
        size: 12,
        createdAt,
      },
    ],
  }
}

beforeEach(() => vi.resetAllMocks())

describe('owned backup creation', () => {
  it('collects each attachment and verifies the snapshot before producing a file', async () => {
    vi.mocked(phase11Request).mockImplementation(async (action) => {
      if (action === 'backup.snapshot') return structuredClone(snapshot())
      if (action === 'attachment.open')
        return { content: 'iVBORw0KGgoAAAAA', mimeType: 'image/png' }
      throw new Error('unexpected action')
    })
    const result = await createAccountBackup()
    expect(phase11Request).toHaveBeenCalledTimes(3)
    expect(parseBackup(result.content).files[0]?.content).toBe('iVBORw0KGgoAAAAA')
  })

  it('refuses to create a backup when a device changes during export', async () => {
    let reads = 0
    vi.mocked(phase11Request).mockImplementation(async (action) => {
      if (action === 'attachment.open')
        return { content: 'iVBORw0KGgoAAAAA', mimeType: 'image/png' }
      const current = snapshot()
      if (++reads === 2) current.devices[0]!.name = '更改后的名称'
      return current
    })
    await expect(createAccountBackup()).rejects.toThrow('发生变化')
  })

  it('rejects unreadable or inconsistent attachments instead of omitting them', async () => {
    vi.mocked(phase11Request).mockImplementation(async (action) =>
      action === 'backup.snapshot'
        ? snapshot()
        : { content: 'iVBORw0KGgoAAAAA', mimeType: 'application/pdf' },
    )
    await expect(createAccountBackup()).rejects.toThrow('附件读取不完整')
  })

  it('does not return data when the account changes during an attachment request', async () => {
    vi.mocked(phase11Request).mockImplementation(async (action) => {
      if (action === 'backup.snapshot') return snapshot()
      invalidateClientRequests()
      return { content: 'iVBORw0KGgoAAAAA', mimeType: 'image/png' }
    })
    await expect(createAccountBackup()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('backup restoration', () => {
  function bundle() {
    return parseBackup(
      createBackup(
        snapshot(),
        [{ id: 'image-1', content: 'iVBORw0KGgoAAAAA' }],
        '2026-11-10T00:00:00Z',
      ),
    )
  }

  it('previews without writing, then sends a confirmed device and its attachment', async () => {
    vi.mocked(phase11Request).mockImplementation(async (action) => {
      if (action === 'backup.restore.preview') return { items: [{ id: 'dev-1', state: 'create' }] }
      return { state: 'created' }
    })
    const data = bundle()
    const preview = await previewAccountRestore(data)
    expect(vi.mocked(phase11Request).mock.calls.map(([action]) => action)).toEqual([
      'backup.restore.preview',
    ])
    const result = await restoreAccountBackup(data, preview)
    expect(result).toEqual({ devices: 1, skipped: 0, conflicts: 0, records: 1 })
    expect(vi.mocked(phase11Request).mock.calls.map(([action]) => action)).toEqual([
      'backup.restore.preview',
      'backup.restore.device',
      'backup.restore.attachment',
    ])
  })

  it('never writes when the original device still exists', async () => {
    const data = bundle()
    const result = await restoreAccountBackup(data, [{ id: 'dev-1', state: 'skip' }])
    expect(result.skipped).toBe(1)
    expect(phase11Request).not.toHaveBeenCalled()
  })

  it('stops additional writes when the user leaves, so a retry can resume later', async () => {
    const data = bundle()
    let active = true
    vi.mocked(phase11Request).mockImplementation(async () => {
      active = false
      return { state: 'created' }
    })
    await expect(
      restoreAccountBackup(
        data,
        [{ id: 'dev-1', state: 'create' }],
        () => {},
        () => active,
      ),
    ).rejects.toThrow('已暂停')
    expect(phase11Request).toHaveBeenCalledTimes(1)
  })

  it('rejects oversized selected files before reading any content', async () => {
    const read = vi.fn()
    vi.stubGlobal('wx', {
      chooseMessageFile: (options: { success(value: unknown): void }) =>
        options.success({
          tempFiles: [{ name: 'backup.json', path: '/tmp/backup.json', size: 21 * 1024 * 1024 }],
        }),
      getFileSystemManager: () => ({ readFileSync: read }),
    })
    await expect(chooseAccountBackup()).rejects.toThrow('不超过 20 MiB')
    expect(read).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
