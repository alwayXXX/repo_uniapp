import { callGearFlowApi } from './cloudbase'
import { ensureSession } from './auth'
import { assertClientRevision, clientRevision } from './client-state'
import { saveAndShareCsv } from './export'
import { clearPreviewFiles, writePreviewFile } from './preview-files'
import { AppError, isRecord } from '@/utils/error'
import type {
  AnnualReport,
  AttachmentItem,
  DisposeDeviceRequest,
  JsonExport,
  ReminderConfig,
  ReminderItem,
} from '@/types/api/phase11'

export async function phase11Request<T>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const revision = clientRevision()
  await ensureSession()
  const result = await callGearFlowApi<T>(action, payload)
  assertClientRevision(revision)
  return result
}

export async function getAnnualReport(year: number): Promise<AnnualReport> {
  const report = await phase11Request<unknown>('report.annual', { year })
  if (
    !isRecord(report) ||
    report.year !== year ||
    report.currency !== 'CNY' ||
    !Array.isArray(report.months) ||
    report.months.length !== 12 ||
    ![
      'purchaseCents',
      'maintenanceCents',
      'disposalIncomeCents',
      'totalSpendCents',
      'netSpendCents',
      'deviceCount',
    ].every((key) => Number.isSafeInteger(report[key]))
  )
    throw new AppError('INTERNAL_ERROR', '年度报告格式错误')
  const counters = [
    'purchaseCount',
    'purchaseCents',
    'maintenanceCount',
    'maintenanceCents',
    'disposalCount',
    'disposalIncomeCents',
  ]
  if (
    counters.some((key) => !Number.isSafeInteger(report[key]) || Number(report[key]) < 0) ||
    report.months.some(
      (month, index) =>
        !isRecord(month) ||
        month.month !== index + 1 ||
        counters.some((key) => !Number.isSafeInteger(month[key]) || Number(month[key]) < 0),
    )
  )
    throw new AppError('INTERNAL_ERROR', '年度报告格式错误')
  return report as unknown as AnnualReport
}

export async function disposeDevice(values: DisposeDeviceRequest): Promise<void> {
  await phase11Request('device.dispose', { ...values })
}

export async function exportAccountJson(): Promise<void> {
  const revision = clientRevision()
  const data = await phase11Request<JsonExport>('export.json')
  if (data.format !== 'gearflow' || data.version !== 1 || !Array.isArray(data.devices))
    throw new AppError('INTERNAL_ERROR', '导出数据格式错误')
  const name = `gearflow_data_${Date.now()}.json`
  await saveAndShareCsv(name, JSON.stringify(data, null, 2), revision)
}

export async function listAttachments(deviceId: string): Promise<AttachmentItem[]> {
  const data = await phase11Request<{ items: AttachmentItem[] }>('attachment.list', { deviceId })
  if (!Array.isArray(data.items)) throw new AppError('INTERNAL_ERROR', '附件数据格式错误')
  return data.items
}

export async function deleteAttachment(id: string): Promise<void> {
  await phase11Request('attachment.delete', { id })
}

/** Narrow WeChat boundary: callbacks carry only the file selected by this user. */
interface WxFiles {
  chooseMedia(options: {
    count: number
    mediaType: string[]
    sourceType: string[]
    success: (value: { tempFiles: Array<{ tempFilePath: string; size: number }> }) => void
    fail: (value: { errMsg?: string }) => void
  }): void
  chooseMessageFile(options: {
    count: number
    type: string
    extension: string[]
    success: (value: { tempFiles: Array<{ name: string; path: string; size: number }> }) => void
    fail: (value: { errMsg?: string }) => void
  }): void
  getFileSystemManager(): {
    readFileSync(path: string, encoding: 'base64'): string
    unlinkSync(path: string): void
  }
  openDocument(options: {
    filePath: string
    showMenu: boolean
    success: () => void
    fail: () => void
  }): void
  previewImage(options: {
    current: string
    urls: string[]
    success: () => void
    fail: () => void
    complete: () => void
  }): void
  requestSubscribeMessage(options: {
    tmplIds: string[]
    success: (value: Record<string, unknown>) => void
    fail: () => void
  }): void
}

function wxFiles(): WxFiles {
  const api = (globalThis as unknown as { wx?: WxFiles }).wx
  if (!api) throw new AppError('INTERNAL_ERROR', '请在微信小程序内使用')
  return api
}

export async function chooseAndUploadAttachment(
  deviceId: string,
  source: 'chat' | 'album' = 'chat',
): Promise<boolean> {
  const api = wxFiles()
  const revision = clientRevision()
  const file = await new Promise<{ name: string; path: string; size: number } | null>(
    (resolve, reject) => {
      const failed = (value: { errMsg?: string }) =>
        value.errMsg?.includes('cancel')
          ? resolve(null)
          : reject(new AppError('INTERNAL_ERROR', '文件选择失败'))
      if (source === 'album') {
        api.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sourceType: ['album'],
          success: (value) => {
            const item = value.tempFiles[0]
            resolve(
              item
                ? {
                    path: item.tempFilePath,
                    size: item.size,
                    name: `device-photo-${Date.now()}.${item.tempFilePath.split('.').pop() || 'jpg'}`,
                  }
                : null,
            )
          },
          fail: failed,
        })
        return
      }
      api.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
        success: (value) => resolve(value.tempFiles[0] || null),
        fail: failed,
      })
    },
  )
  assertClientRevision(revision)
  if (!file) return false
  if (file.size <= 0 || file.size > 2 * 1024 * 1024)
    throw new AppError('VALIDATION_ERROR', '请选择不超过 2 MiB 的文件')
  const content = api.getFileSystemManager().readFileSync(file.path, 'base64')
  await phase11Request('attachment.upload', { deviceId, name: file.name, content })
  return true
}

export async function openAttachment(id: string): Promise<void> {
  const api = wxFiles()
  const revision = clientRevision()
  const result = await phase11Request<{ content: string; mimeType: string }>('attachment.open', {
    id,
  })
  assertClientRevision(revision)
  const path = writePreviewFile(result.content, result.mimeType)
  try {
    assertClientRevision(revision)
    await new Promise<void>((resolve, reject) => {
      if (result.mimeType === 'application/pdf')
        api.openDocument({
          filePath: path,
          showMenu: false,
          success: resolve,
          fail: () => reject(new AppError('INTERNAL_ERROR', '无法打开 PDF')),
        })
      else
        api.previewImage({
          current: path,
          urls: [path],
          success: resolve,
          fail: () => reject(new AppError('INTERNAL_ERROR', '无法预览图片')),
          complete() {},
        })
    })
  } catch (error) {
    clearPreviewFiles()
    throw error
  }
}

export async function getReminderConfig(): Promise<ReminderConfig> {
  return phase11Request('reminder.config')
}
export async function listReminders(deviceId: string): Promise<ReminderItem[]> {
  return (await phase11Request<{ items: ReminderItem[] }>('reminder.list', { deviceId })).items
}
export async function cancelReminder(id: string): Promise<void> {
  await phase11Request('reminder.cancel', { id })
}

/** Called directly from a user tap, before network work, to preserve WeChat's gesture requirement. */
export async function subscribeReminder(
  deviceId: string,
  remindOn: string,
  templateId: string,
): Promise<boolean> {
  const api = wxFiles()
  const revision = clientRevision()
  const accepted = await new Promise<boolean>((resolve, reject) =>
    api.requestSubscribeMessage({
      tmplIds: [templateId],
      success: (value) => resolve(value[templateId] === 'accept'),
      fail: () => reject(new AppError('INTERNAL_ERROR', '订阅授权失败，请重试')),
    }),
  )
  assertClientRevision(revision)
  if (!accepted) return false
  await phase11Request('reminder.create', { deviceId, remindOn, templateId })
  return true
}
