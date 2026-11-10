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
    await expect(chooseAiImage()).rejects.toThrow('不超过 1 MiB')
    expect(readFileSync).not.toHaveBeenCalled()
    expect(phase11Request).not.toHaveBeenCalled()
  })
  it('rejects an unsupported file signature before requesting AI', () => {
    vi.stubGlobal('wx', { getFileSystemManager: () => ({ readFileSync: () => 'c29tZXRoaW5n' }) })
    expect(() => readAiImage('test')).toThrow('JPEG 或 PNG')
    expect(phase11Request).not.toHaveBeenCalled()
  })
})
