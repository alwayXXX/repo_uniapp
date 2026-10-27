import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callGearFlowApi } from './cloudbase'
import { ensureSession } from './auth'
import { invalidateClientRequests } from './client-state'
import {
  chooseAndUploadAttachment,
  getAnnualReport,
  openAttachment,
  phase11Request,
  subscribeReminder,
} from './phase11'
import { clearPreviewFiles } from './preview-files'

vi.mock('./cloudbase', () => ({ callGearFlowApi: vi.fn() }))
vi.mock('./auth', () => ({ ensureSession: vi.fn() }))

const unlink = vi.fn()
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(ensureSession).mockResolvedValue(undefined)
  vi.stubGlobal('wx', { getFileSystemManager: () => ({ unlinkSync: unlink }) })
  clearPreviewFiles()
})
afterEach(() => {
  clearPreviewFiles()
  vi.unstubAllGlobals()
})

describe('Phase 11 service boundaries', () => {
  it('rejects responses that complete after account state invalidation', async () => {
    let resolve: (value: unknown) => void = () => undefined
    vi.mocked(callGearFlowApi).mockImplementation(
      () =>
        new Promise((value) => {
          resolve = value
        }),
    )
    const request = phase11Request('report.annual', { year: 2026 })
    await Promise.resolve()
    invalidateClientRequests()
    resolve({ year: 2026 })
    await expect(request).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('rejects malformed annual-month data rather than rendering partial totals', async () => {
    vi.mocked(callGearFlowApi).mockResolvedValue({ year: 2026, currency: 'CNY', months: [] })
    await expect(getAnnualReport(2026)).rejects.toThrow('年度报告格式错误')
  })

  it('does not create a reminder when subscription permission is rejected', async () => {
    vi.stubGlobal('wx', {
      requestSubscribeMessage: (options: { success(value: Record<string, string>): void }) =>
        options.success({ template: 'reject' }),
    })
    await expect(subscribeReminder('device', '2026-11-01', 'template')).resolves.toBe(false)
    expect(callGearFlowApi).not.toHaveBeenCalled()
  })

  it('requests native permission before any network wait and creates only an accepted plan', async () => {
    const gesture = vi.fn((options: { success(value: Record<string, string>): void }) =>
      options.success({ template: 'accept' }),
    )
    vi.stubGlobal('wx', { requestSubscribeMessage: gesture })
    vi.mocked(callGearFlowApi).mockResolvedValue({ item: { id: 'reminder' } })
    const pending = subscribeReminder('device', '2026-11-01', 'template')
    expect(gesture).toHaveBeenCalledOnce()
    expect(ensureSession).not.toHaveBeenCalled()
    await expect(pending).resolves.toBe(true)
    expect(callGearFlowApi).toHaveBeenCalledWith('reminder.create', {
      deviceId: 'device',
      remindOn: '2026-11-01',
      templateId: 'template',
    })
  })

  it('rejects oversized selected files before reading or uploading their contents', async () => {
    const read = vi.fn()
    vi.stubGlobal('wx', {
      chooseMessageFile: (options: { success(value: unknown): void }) =>
        options.success({
          tempFiles: [{ path: '/tmp/file', name: 'receipt.pdf', size: 2 * 1024 * 1024 + 1 }],
        }),
      getFileSystemManager: () => ({ readFileSync: read }),
    })
    await expect(chooseAndUploadAttachment('device')).rejects.toThrow('不超过 2 MiB')
    expect(read).not.toHaveBeenCalled()
    expect(callGearFlowApi).not.toHaveBeenCalled()
  })

  it('treats cancelling file selection as a no-op', async () => {
    vi.stubGlobal('wx', {
      chooseMessageFile: (options: { fail(value: { errMsg: string }): void }) =>
        options.fail({ errMsg: 'chooseMessageFile:fail cancel' }),
    })
    await expect(chooseAndUploadAttachment('device')).resolves.toBe(false)
    expect(callGearFlowApi).not.toHaveBeenCalled()
  })

  it('keeps a native document available until return, then removes its local temporary file', async () => {
    vi.mocked(callGearFlowApi).mockResolvedValue({
      content: 'JVBERi0xLjQK',
      mimeType: 'application/pdf',
    })
    vi.stubGlobal('wx', {
      env: { USER_DATA_PATH: '/test' },
      openDocument: (options: { success(): void }) => options.success(),
      getFileSystemManager: () => ({
        unlinkSync: unlink,
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
        readdirSync: () => [],
      }),
    })
    await openAttachment('attachment')
    expect(unlink).not.toHaveBeenCalled()
    clearPreviewFiles()
    expect(unlink).toHaveBeenCalledWith(
      expect.stringMatching(/^\/test\/gearflow-previews\/gearflow_preview_\d+_\d+\.pdf$/),
    )
  })
})
