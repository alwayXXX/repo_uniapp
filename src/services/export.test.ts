import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearGeneratedExports, csvFileName, saveAndShareCsv } from './export'
import { clientRevision, invalidateClientRequests } from './client-state'

interface ShareOptions {
  filePath: string
  success(): void
  fail(error: { errMsg: string }): void
}
let files: Map<string, string>
let directories: Set<string>
const share = vi.fn<(options: ShareOptions) => void>()
const fs = {
  readdirSync: vi.fn<(path: string) => string[]>(),
  mkdirSync: vi.fn<(path: string, recursive: boolean) => void>(),
  writeFileSync: vi.fn<(path: string, data: string, encoding: string) => void>(),
  unlinkSync: vi.fn<(path: string) => void>(),
}

beforeEach(() => {
  vi.resetAllMocks()
  files = new Map()
  directories = new Set(['/test-user-data'])
  fs.readdirSync.mockImplementation((path) => {
    if (!directories.has(path)) throw { errMsg: 'readdir:fail no such file or directory' }
    return [...files.keys()]
      .filter((file) => file.startsWith(`${path}/`) && !file.slice(path.length + 1).includes('/'))
      .map((file) => file.slice(path.length + 1))
  })
  fs.mkdirSync.mockImplementation((path) => {
    directories.add(path)
  })
  fs.writeFileSync.mockImplementation((path, data) => {
    files.set(path, data)
  })
  fs.unlinkSync.mockImplementation((path) => {
    if (!files.delete(path)) throw { errMsg: 'unlink:fail no such file or directory' }
  })
  share.mockImplementation((options) => options.success())
  vi.stubGlobal('wx', { env: { USER_DATA_PATH: '/test-user-data' }, shareFileMessage: share })
  vi.stubGlobal('uni', { getFileSystemManager: () => fs })
})
afterEach(() => vi.unstubAllGlobals())

describe('private export lifecycle', () => {
  it('cleans JSON exports through the same sharing and logout lifecycle', async () => {
    await saveAndShareCsv('gearflow_data.json', '{"version":1}')
    expect(files.size).toBe(0)
    files.set('/test-user-data/gearflow_leftover.json', 'synthetic')
    clearGeneratedExports()
    expect(files.size).toBe(0)
  })
  it.each(['success', 'cancel', 'error'])('removes the temporary CSV after %s', async (outcome) => {
    share.mockImplementationOnce((options) => {
      expect(files.has(options.filePath)).toBe(true)
      if (outcome === 'success') options.success()
      else
        options.fail({
          errMsg: outcome === 'cancel' ? 'share:fail cancel' : 'raw third-party failure',
        })
    })
    const result = saveAndShareCsv('gearflow_test.csv', 'synthetic-only')
    if (outcome === 'error')
      await expect(result).rejects.toMatchObject({ message: '分享失败，请重试' })
    else await result
    expect(files.size).toBe(0)
  })

  it('clears only generated CSVs, including legacy files', () => {
    directories.add('/test-user-data/gearflow-exports')
    files.set('/test-user-data/gearflow_legacy.csv', 'synthetic')
    files.set('/test-user-data/gearflow-exports/gearflow_current.csv', 'synthetic')
    files.set('/test-user-data/unrelated.csv', 'keep')
    clearGeneratedExports()
    expect([...files.keys()]).toEqual(['/test-user-data/unrelated.csv'])
  })

  it('reports cleanup failure instead of claiming success', () => {
    files.set('/test-user-data/gearflow_legacy.csv', 'synthetic')
    fs.unlinkSync.mockImplementationOnce(() => {
      throw { errMsg: 'permission denied' }
    })
    expect(clearGeneratedExports).toThrow('本机导出文件清理失败')
  })

  it('accepts missing-directory exceptions exposed as Error.message', () => {
    fs.readdirSync.mockImplementationOnce(() => [])
    fs.readdirSync.mockImplementationOnce(() => {
      throw new Error('readdirSync:fail no such file or directory')
    })
    expect(clearGeneratedExports).not.toThrow()
  })

  it('treats an already removed file as cleaned when a sync API throws Error', () => {
    files.set('/test-user-data/gearflow_legacy.csv', 'synthetic')
    fs.unlinkSync.mockImplementationOnce((path) => {
      files.delete(path)
      throw new Error('unlinkSync:fail no such file or directory')
    })
    expect(clearGeneratedExports).not.toThrow()
    expect(files.size).toBe(0)
  })

  it('continues cleaning other generated files after one removal fails', () => {
    directories.add('/test-user-data/gearflow-exports')
    files.set('/test-user-data/gearflow_locked.csv', 'synthetic')
    files.set('/test-user-data/gearflow_other.csv', 'synthetic')
    files.set('/test-user-data/gearflow-exports/gearflow_current.csv', 'synthetic')
    fs.unlinkSync.mockImplementationOnce(() => {
      throw new Error('unlinkSync:fail permission denied')
    })
    expect(clearGeneratedExports).toThrow('本机导出文件清理失败')
    expect([...files.keys()]).toEqual(['/test-user-data/gearflow_locked.csv'])
    clearGeneratedExports()
    expect(files.size).toBe(0)
  })

  it('can reuse the export directory when mkdirSync reports that it exists', async () => {
    directories.add('/test-user-data/gearflow-exports')
    fs.mkdirSync.mockImplementationOnce(() => {
      throw new Error('mkdirSync:fail file already exists')
    })
    await saveAndShareCsv('gearflow_test.csv', 'synthetic')
    expect(share).toHaveBeenCalledOnce()
    expect(files.size).toBe(0)
  })

  it('removes a partial file when writing fails', async () => {
    fs.writeFileSync.mockImplementationOnce((path) => {
      files.set(path, 'partial synthetic data')
      throw new Error('synthetic disk full')
    })
    await expect(saveAndShareCsv('gearflow_test.csv', 'synthetic')).rejects.toMatchObject({
      message: '导出文件生成失败，请检查存储空间',
    })
    expect(files.size).toBe(0)
    expect(share).not.toHaveBeenCalled()
  })

  it('reports a failed cleanup after sharing and supports retry', async () => {
    fs.unlinkSync.mockImplementationOnce(() => {
      throw { errMsg: 'permission denied' }
    })
    await expect(saveAndShareCsv('gearflow_test.csv', 'synthetic')).rejects.toMatchObject({
      message: '本机导出文件清理失败，请重试',
    })
    clearGeneratedExports()
    expect(files.size).toBe(0)
  })

  it('blocks an export started before logout', async () => {
    const revision = clientRevision()
    invalidateClientRequests()
    await expect(saveAndShareCsv('gearflow_test.csv', 'synthetic', revision)).rejects.toMatchObject(
      { code: 'UNAUTHORIZED' },
    )
    expect(fs.writeFileSync).not.toHaveBeenCalled()
    expect(share).not.toHaveBeenCalled()
  })

  it('handles cleanup during an active share without recreating the file', async () => {
    let finish = () => {}
    share.mockImplementationOnce((options) => {
      finish = options.success
    })
    const result = saveAndShareCsv('gearflow_test.csv', 'synthetic')
    clearGeneratedExports()
    finish()
    await result
    expect(files.size).toBe(0)
  })

  it('rejects path traversal and sanitizes device-derived names', async () => {
    await expect(saveAndShareCsv('../outside.csv', 'synthetic')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    })
    const name = csvFileName('gearflow_device/with\\separators')
    expect(name).not.toMatch(/[/\\]/)
    expect(name).toMatch(/^gearflow_.*\.csv$/)
    expect(csvFileName('gearflow_test')).not.toBe(csvFileName('gearflow_test'))
  })
})
