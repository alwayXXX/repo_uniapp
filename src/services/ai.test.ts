import { afterEach, describe, expect, it, vi } from 'vitest'
import { phase11Request } from './phase11'
import { chooseAiImage, readAiImage, requestAdvisor, requestImage } from './ai'
import type { AdvisorFacts } from '@/types/api/ai'

vi.mock('./phase11', () => ({ phase11Request: vi.fn() }))
afterEach(() => {
  vi.resetAllMocks()
  vi.unstubAllGlobals()
})

describe('AI service boundaries', () => {
  it('sends only the confirmed advisor summary and filters response fields', async () => {
    const facts: AdvisorFacts = {
      asOf: '2026-11-10',
      category: '电脑',
      brand: null,
      model: null,
      status: 'IN_USE',
      purchaseDate: null,
      warrantyEndDate: null,
      maintenanceCount: 0,
      knownMaintenanceCents: 0,
      maintenanceCostUnknownCount: 0,
    }
    vi.mocked(phase11Request).mockResolvedValue({
      suggestions: ['检查保修'],
      missing: [],
      secret: 'ignored',
    })
    await expect(requestAdvisor(facts)).resolves.toEqual({ suggestions: ['检查保修'], missing: [] })
    expect(phase11Request).toHaveBeenCalledWith('ai.request', {
      kind: 'advisor',
      data: facts,
      confirmed: true,
    })
  })
  it('rejects malformed output', async () => {
    vi.mocked(phase11Request).mockResolvedValue({ category: {}, brand: null, model: null })
    await expect(requestImage({ mimeType: 'image/png', content: 'test' })).rejects.toThrow(
      'AI 返回格式异常',
    )
  })
  it('does not read oversized images or send during image selection', async () => {
    const readFileSync = vi.fn()
    vi.stubGlobal('wx', {
      chooseMedia: (options: { success(value: unknown): void }) =>
        options.success({ tempFiles: [{ tempFilePath: 'test.jpg', size: 1024 * 1024 + 1 }] }),
      getFileSystemManager: () => ({ readFileSync }),
    })
    await expect(chooseAiImage()).rejects.toThrow('超过 1 MiB')
    expect(readFileSync).not.toHaveBeenCalled()
    expect(phase11Request).not.toHaveBeenCalled()
  })
  it('previews the compressed local file without sending an AI request', async () => {
    const compressImage = vi.fn((options: { success(value: unknown): void }) =>
      options.success({ tempFilePath: 'compressed.jpg' }),
    )
    vi.stubGlobal('wx', {
      chooseMedia: (options: { success(value: unknown): void }) =>
        options.success({ tempFiles: [{ tempFilePath: 'original.jpg', size: 4 * 1024 * 1024 }] }),
      compressImage,
      getFileInfo: (options: { success(value: unknown): void }) =>
        options.success({ size: 500000 }),
    })
    await expect(chooseAiImage()).resolves.toEqual({ path: 'compressed.jpg', size: 500000 })
    expect(compressImage).toHaveBeenCalledOnce()
    expect(phase11Request).not.toHaveBeenCalled()
  })
  it('rejects a compressed image that is still oversized', async () => {
    vi.stubGlobal('wx', {
      chooseMedia: (options: { success(value: unknown): void }) =>
        options.success({ tempFiles: [{ tempFilePath: 'original.jpg', size: 4 * 1024 * 1024 }] }),
      compressImage: (options: { success(value: unknown): void }) =>
        options.success({ tempFilePath: 'compressed.jpg' }),
      getFileInfo: (options: { success(value: unknown): void }) =>
        options.success({ size: 1024 * 1024 + 1 }),
    })
    await expect(chooseAiImage()).rejects.toThrow('压缩后仍超过 1 MiB')
    expect(phase11Request).not.toHaveBeenCalled()
  })
  it('rejects an unsupported file signature before requesting AI', () => {
    vi.stubGlobal('wx', { getFileSystemManager: () => ({ readFileSync: () => 'c29tZXRoaW5n' }) })
    expect(() => readAiImage('test')).toThrow('JPEG 或 PNG')
    expect(phase11Request).not.toHaveBeenCalled()
  })
})
