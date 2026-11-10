import { phase11Request } from './phase11'
import { assertClientRevision, clientRevision } from './client-state'
import { saveAndShareFile } from './export'
import { AppError, isRecord } from '@/utils/error'
import { createBackup, MAX_BACKUP_BYTES, parseBackup, validateSnapshot } from '@/utils/backup'
import type {
  BackupBundle,
  BackupFileContent,
  BackupRecord,
  BackupSnapshot,
  RestorePreviewItem,
  RestorePreviewState,
  RestoreSummary,
} from '@/types/api/backup'

/** Build the backup only when all owned attachments and both snapshots agree. */
export async function createAccountBackup(): Promise<{
  content: string
  snapshot: BackupSnapshot
}> {
  const revision = clientRevision()
  const initial = validateSnapshot(await phase11Request<unknown>('backup.snapshot'))
  const estimatedFileSize = initial.attachments.reduce(
    (sum, item) => sum + Math.ceil(item.size / 3) * 4,
    0,
  )
  if (estimatedFileSize > MAX_BACKUP_BYTES)
    throw new AppError('VALIDATION_ERROR', '备份超过 20 MiB，暂不能合并为一个文件')
  const files: BackupFileContent[] = []
  for (const item of initial.attachments) {
    const response = await phase11Request<unknown>('attachment.open', { id: item.id })
    assertClientRevision(revision)
    if (
      !isRecord(response) ||
      typeof response.content !== 'string' ||
      response.mimeType !== item.mimeType
    )
      throw new AppError('INTERNAL_ERROR', '附件读取不完整，请重试备份')
    files.push({ id: item.id, content: response.content })
  }
  const final = validateSnapshot(await phase11Request<unknown>('backup.snapshot'))
  assertClientRevision(revision)
  if (JSON.stringify(initial) !== JSON.stringify(final))
    throw new AppError('RATE_LIMITED', '设备或附件在备份期间发生变化，请重试')
  return { content: createBackup(initial, files, new Date().toISOString()), snapshot: initial }
}

/** The WeChat share result is not evidence that a copy has been safely stored. */
export async function shareAccountBackup(): Promise<'shared' | 'cancelled'> {
  const revision = clientRevision()
  const backup = await createAccountBackup()
  assertClientRevision(revision)
  return saveAndShareFile(`gearflow_backup_${Date.now()}.json`, backup.content, revision)
}

interface WxBackupFileApi {
  chooseMessageFile(options: {
    count: number
    type: 'file'
    extension: string[]
    success: (value: { tempFiles: Array<{ name: string; path: string; size: number }> }) => void
    fail: (error: { errMsg?: string }) => void
  }): void
  getFileSystemManager(): { readFileSync(path: string, encoding: 'utf8'): string }
}

/** The picker and file read stay on the device; no restore happens on selection. */
export async function chooseAccountBackup(): Promise<BackupBundle | null> {
  const api = (globalThis as unknown as { wx?: WxBackupFileApi }).wx
  if (!api || typeof api.chooseMessageFile !== 'function')
    throw new AppError('INTERNAL_ERROR', '请在微信小程序内选择备份文件')
  const revision = clientRevision()
  const file = await new Promise<{ name: string; path: string; size: number } | null>(
    (resolve, reject) => {
      api.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['json'],
        success: (result) => resolve(result.tempFiles[0] ?? null),
        fail: (error) =>
          error.errMsg?.includes('cancel')
            ? resolve(null)
            : reject(new AppError('INTERNAL_ERROR', '选择备份文件失败')),
      })
    },
  )
  assertClientRevision(revision)
  if (!file) return null
  if (
    !file.name.toLowerCase().endsWith('.json') ||
    !Number.isSafeInteger(file.size) ||
    file.size <= 0 ||
    file.size > MAX_BACKUP_BYTES
  )
    throw new AppError('VALIDATION_ERROR', '请选择不超过 20 MiB 的备份 JSON 文件')
  let content: string
  try {
    content = api.getFileSystemManager().readFileSync(file.path, 'utf8')
  } catch {
    throw new AppError('INTERNAL_ERROR', '读取备份文件失败')
  }
  assertClientRevision(revision)
  return parseBackup(content)
}

function recordId(row: BackupRecord): string {
  if (typeof row.id !== 'string' || !row.id) throw new AppError('VALIDATION_ERROR', '备份记录无效')
  return row.id
}

function categoryCode(snapshot: BackupSnapshot, device: BackupRecord): string | null {
  if (device.categoryId == null) return null
  const category = snapshot.categories.find((item) => item.id === device.categoryId)
  if (!category || typeof category.code !== 'string')
    throw new AppError('VALIDATION_ERROR', '备份分类不完整')
  return category.code
}

const PREVIEW_STATES: RestorePreviewState[] = ['skip', 'create', 'resume', 'conflict']

export async function previewAccountRestore(bundle: BackupBundle): Promise<RestorePreviewItem[]> {
  const devices = bundle.snapshot.devices.map((device) => ({
    id: recordId(device),
    categoryCode: categoryCode(bundle.snapshot, device),
  }))
  const response = await phase11Request<unknown>('backup.restore.preview', { devices })
  if (
    !isRecord(response) ||
    !Array.isArray(response.items) ||
    response.items.length !== devices.length
  )
    throw new AppError('INTERNAL_ERROR', '恢复预览结果不完整')
  const expected = new Set(devices.map((device) => device.id))
  const items: RestorePreviewItem[] = []
  for (const item of response.items) {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      !expected.delete(item.id) ||
      typeof item.state !== 'string' ||
      !PREVIEW_STATES.includes(item.state as RestorePreviewState)
    )
      throw new AppError('INTERNAL_ERROR', '恢复预览结果无效')
    items.push({ id: item.id, state: item.state as RestorePreviewState })
  }
  return items
}

function grouped(rows: BackupRecord[]): Map<string, BackupRecord[]> {
  const result = new Map<string, BackupRecord[]>()
  for (const row of rows) {
    if (typeof row.deviceId !== 'string') throw new AppError('VALIDATION_ERROR', '备份记录关联无效')
    const previous = result.get(row.deviceId) ?? []
    previous.push(row)
    result.set(row.deviceId, previous)
  }
  return result
}

/** Resume is idempotent: each server action creates only a missing owned item. */
export async function restoreAccountBackup(
  bundle: BackupBundle,
  preview: RestorePreviewItem[],
  onProgress: (completed: number, total: number) => void = () => {},
  shouldContinue: () => boolean = () => true,
): Promise<RestoreSummary> {
  const revision = clientRevision()
  const states = new Map(preview.map((item) => [item.id, item.state]))
  if (
    states.size !== bundle.snapshot.devices.length ||
    bundle.snapshot.devices.some((row) => !states.has(recordId(row)))
  )
    throw new AppError('VALIDATION_ERROR', '恢复预览已失效，请重新选择文件')
  const result: RestoreSummary = { devices: 0, skipped: 0, conflicts: 0, records: 0 }
  const groups = [
    ['backup.restore.warranty', grouped(bundle.snapshot.warranties)],
    ['backup.restore.maintenance', grouped(bundle.snapshot.maintenances)],
    ['backup.restore.timeline', grouped(bundle.snapshot.timelines)],
    ['backup.restore.attachment', grouped(bundle.snapshot.attachments)],
  ] as const
  const contents = new Map(bundle.files.map((item) => [item.id, item.content]))
  const total = bundle.snapshot.devices.length
  let completed = 0
  function checkActive(): void {
    assertClientRevision(revision)
    if (!shouldContinue()) throw new AppError('INTERNAL_ERROR', '恢复已暂停，选择同一文件可继续')
  }
  for (const device of bundle.snapshot.devices) {
    checkActive()
    const id = recordId(device)
    const state = states.get(id)
    if (state === 'skip' || state === 'conflict') {
      if (state === 'skip') result.skipped++
      else result.conflicts++
      onProgress(++completed, total)
      continue
    }
    const saved = await phase11Request<unknown>('backup.restore.device', {
      device,
      categoryCode: categoryCode(bundle.snapshot, device),
    })
    checkActive()
    if (
      !isRecord(saved) ||
      !['created', 'resume', 'skip', 'conflict'].includes(String(saved.state))
    )
      throw new AppError('INTERNAL_ERROR', '恢复设备结果无效')
    if (saved.state === 'skip' || saved.state === 'conflict') {
      if (saved.state === 'skip') result.skipped++
      else result.conflicts++
      onProgress(++completed, total)
      continue
    }
    if (saved.state === 'created') result.devices++
    for (const [action, byDevice] of groups) {
      for (const item of byDevice.get(id) ?? []) {
        checkActive()
        const payload: Record<string, unknown> = { sourceDeviceId: id, item }
        if (action === 'backup.restore.attachment') {
          const content = contents.get(recordId(item))
          if (typeof content !== 'string') throw new AppError('VALIDATION_ERROR', '备份附件缺失')
          payload.content = content
        }
        const restored = await phase11Request<unknown>(action, payload)
        checkActive()
        if (
          !isRecord(restored) ||
          !['created', 'exists', 'conflict'].includes(String(restored.state))
        )
          throw new AppError('INTERNAL_ERROR', '恢复记录结果无效')
        if (restored.state === 'conflict') result.conflicts++
        else if (restored.state === 'created') result.records++
      }
    }
    onProgress(++completed, total)
  }
  return result
}
