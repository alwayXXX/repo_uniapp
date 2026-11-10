import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import { AppError, isRecord } from './error'
import type {
  BackupAttachment,
  BackupBundle,
  BackupFileContent,
  BackupSnapshot,
} from '@/types/api/backup'

export const MAX_BACKUP_BYTES = 20 * 1024 * 1024
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024
const MAX_RECORDS = 100000
const MAX_DEVICES = 1000

function invalid(message = '备份文件格式错误或内容不完整'): never {
  throw new AppError('VALIDATION_ERROR', message)
}

function record(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !Array.isArray(value)
}

/** Encode UTF-8 without relying on TextEncoder, which may be absent in WeChat. */
function utf8(value: string): Uint8Array {
  const out = new Uint8Array(value.length * 3)
  let used = 0
  for (let index = 0; index < value.length; index++) {
    let point = value.charCodeAt(index)
    if (point >= 0xd800 && point <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        point = 0x10000 + ((point - 0xd800) << 10) + next - 0xdc00
        index++
      } else point = 0xfffd
    } else if (point >= 0xdc00 && point <= 0xdfff) point = 0xfffd
    if (point < 0x80) out[used++] = point
    else if (point < 0x800) {
      out[used++] = 0xc0 | (point >> 6)
      out[used++] = 0x80 | (point & 0x3f)
    } else if (point < 0x10000) {
      out[used++] = 0xe0 | (point >> 12)
      out[used++] = 0x80 | ((point >> 6) & 0x3f)
      out[used++] = 0x80 | (point & 0x3f)
    } else {
      out[used++] = 0xf0 | (point >> 18)
      out[used++] = 0x80 | ((point >> 12) & 0x3f)
      out[used++] = 0x80 | ((point >> 6) & 0x3f)
      out[used++] = 0x80 | (point & 0x3f)
    }
  }
  return out.subarray(0, used)
}

/** Hash in bounded chunks so a large backup does not need a second full byte buffer. */
export function sha256Text(value: string): string {
  const hash = sha256.create()
  for (let start = 0; start < value.length;) {
    let end = Math.min(start + 4096, value.length)
    const last = value.charCodeAt(end - 1)
    if (end < value.length && last >= 0xd800 && last <= 0xdbff) end--
    hash.update(utf8(value.slice(start, end)))
    start = end
  }
  return bytesToHex(hash.digest())
}

export function utf8Size(value: string): number {
  let total = 0
  for (let start = 0; start < value.length;) {
    let end = Math.min(start + 4096, value.length)
    const last = value.charCodeAt(end - 1)
    if (end < value.length && last >= 0xd800 && last <= 0xdbff) end--
    total += utf8(value.slice(start, end)).length
    start = end
  }
  return total
}

function safeId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128
}

function validText(value: unknown, maximum: number, required = false): boolean {
  if (value === null || value === undefined || value === '') return !required
  return typeof value === 'string' && value.length <= maximum && (!required || !!value.trim())
}

function validDate(value: unknown, required = false): boolean {
  if (value === null || value === undefined || value === '') return !required
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function validTimestamp(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 40) return false
  const normal = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value
  const time = Date.parse(normal)
  return Number.isFinite(time) && time >= 0 && time <= 2147483647000
}

function validAmount(value: unknown): boolean {
  return (
    value == null ||
    (Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 2147483647)
  )
}

function validTimelinePayload(value: unknown): boolean {
  let data = value
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data) as unknown
    } catch {
      return false
    }
  }
  if (data == null) return true
  if (!record(data)) return false
  const fields = data.changedFields === undefined ? [] : data.changedFields
  return (
    Array.isArray(fields) &&
    fields.length <= 50 &&
    fields.every((field) => typeof field === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(field))
  )
}

function requireRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > MAX_RECORDS || value.some((row) => !record(row)))
    invalid()
  const rows = value as Record<string, unknown>[]
  const ids = new Set<string>()
  for (const row of rows) {
    if (!safeId(row.id) || ids.has(row.id)) invalid()
    if (['openid', 'userId', 'cloud_path', 'file_id', 'fileID'].some((key) => key in row)) invalid()
    ids.add(row.id)
  }
  return rows
}

export function validateSnapshot(value: unknown): BackupSnapshot {
  if (!record(value)) invalid()
  const devices = requireRows(value.devices)
  if (devices.length > MAX_DEVICES) invalid('备份设备超过 1000 台，暂不能导出或恢复')
  const warranties = requireRows(value.warranties)
  const maintenances = requireRows(value.maintenances)
  const timelines = requireRows(value.timelines)
  const attachments = requireRows(value.attachments)
  const categories = requireRows(value.categories)
  const deviceIds = new Set(devices.map((row) => row.id))
  const categoryIds = new Set(categories.map((row) => row.id))
  const categoryCodes = new Set<string>()
  for (const category of categories) {
    if (!safeId(category.code) || category.code.length > 32 || categoryCodes.has(category.code))
      invalid()
    categoryCodes.add(category.code)
  }
  for (const device of devices) {
    if (
      typeof device.name !== 'string' ||
      !device.name.trim() ||
      device.name.length > 64 ||
      !['IN_USE', 'IDLE', 'SOLD', 'DISCARDED'].includes(String(device.status)) ||
      device.deletedAt != null ||
      (device.categoryId != null && !categoryIds.has(device.categoryId)) ||
      !validText(device.brand, 64) ||
      !validText(device.model, 128) ||
      !validText(device.serialNumber, 128) ||
      !validText(device.purchaseChannel, 128) ||
      !validText(device.notes, 1000) ||
      !validText(device.disposalNotes, 1000) ||
      !validDate(device.purchaseDate) ||
      !validDate(device.disposalDate) ||
      !validAmount(device.purchasePriceCents) ||
      !validAmount(device.disposalPriceCents) ||
      device.currency !== 'CNY' ||
      !validTimestamp(device.createdAt) ||
      !validTimestamp(device.updatedAt)
    )
      invalid()
  }
  const warrantyDevices = new Set<unknown>()
  for (const warranty of warranties) {
    if (
      !deviceIds.has(warranty.deviceId) ||
      warrantyDevices.has(warranty.deviceId) ||
      !validDate(warranty.startDate) ||
      !validDate(warranty.endDate, true) ||
      (typeof warranty.startDate === 'string' &&
        typeof warranty.endDate === 'string' &&
        warranty.startDate > warranty.endDate) ||
      !validText(warranty.provider, 128) ||
      !validText(warranty.scope, 128) ||
      !validText(warranty.notes, 1000) ||
      !validTimestamp(warranty.createdAt) ||
      !validTimestamp(warranty.updatedAt)
    )
      invalid()
    warrantyDevices.add(warranty.deviceId)
  }
  for (const row of [...maintenances, ...timelines, ...attachments])
    if (!deviceIds.has(row.deviceId)) invalid()
  for (const item of maintenances)
    if (
      !validText(item.title, 64, true) ||
      !['REPAIR', 'UPGRADE', 'CLEAN', 'REPLACE', 'INSPECT', 'OTHER'].includes(String(item.type)) ||
      !validDate(item.occurredAt, true) ||
      !validAmount(item.costCents) ||
      !validText(item.vendor, 128) ||
      !validText(item.notes, 1000) ||
      !validTimestamp(item.createdAt) ||
      !validTimestamp(item.updatedAt)
    )
      invalid()
  for (const item of timelines)
    if (
      !['CREATED', 'UPDATED', 'MAINTENANCE', 'WARRANTY', 'DISPOSED'].includes(
        String(item.eventType),
      ) ||
      !validDate(item.eventDate, true) ||
      !validText(item.title, 128, true) ||
      !validText(item.description, 255) ||
      !validTimelinePayload(item.payload) ||
      !validTimestamp(item.createdAt)
    )
      invalid()
  const attachmentCounts = new Map<unknown, number>()
  for (const item of attachments) {
    if (
      typeof item.name !== 'string' ||
      !item.name ||
      item.name.length > 128 ||
      /[\\/\x00-\x1f]/.test(item.name) ||
      !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(
        String(item.mimeType),
      ) ||
      !Number.isSafeInteger(item.size) ||
      Number(item.size) <= 0 ||
      Number(item.size) > MAX_ATTACHMENT_BYTES ||
      !validTimestamp(item.createdAt)
    )
      invalid()
    const count = (attachmentCounts.get(item.deviceId) || 0) + 1
    if (count > 10) invalid()
    attachmentCounts.set(item.deviceId, count)
  }
  return {
    devices,
    warranties,
    maintenances,
    timelines,
    attachments: attachments as BackupAttachment[],
    categories,
  }
}

function base64Size(content: string): number {
  if (!content || content.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(content)) invalid()
  const padding = content.endsWith('==') ? 2 : content.endsWith('=') ? 1 : 0
  return (content.length / 4) * 3 - padding
}

function validFileHeader(content: string, attachment: BackupAttachment): boolean {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const bytes: number[] = []
  const prefix = content.slice(0, 24)
  let bits = 0
  let count = 0
  for (const character of prefix) {
    if (character === '=') break
    const value = alphabet.indexOf(character)
    if (value < 0) return false
    bits = (bits << 6) | value
    count += 6
    if (count >= 8) {
      count -= 8
      bytes.push((bits >> count) & 255)
      bits &= (1 << count) - 1
    }
  }
  const extension = attachment.name.split('.').pop()?.toLowerCase()
  if (attachment.mimeType === 'image/png')
    return extension === 'png' && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
  if (attachment.mimeType === 'image/jpeg')
    return (
      ['jpg', 'jpeg'].includes(extension ?? '') && [255, 216, 255].every((v, i) => bytes[i] === v)
    )
  if (attachment.mimeType === 'application/pdf')
    return extension === 'pdf' && [37, 80, 68, 70, 45].every((v, i) => bytes[i] === v)
  return (
    extension === 'webp' &&
    [82, 73, 70, 70].every((v, i) => bytes[i] === v) &&
    [87, 69, 66, 80].every((v, i) => bytes[i + 8] === v)
  )
}

function validateFiles(snapshot: BackupSnapshot, value: unknown): BackupFileContent[] {
  if (!Array.isArray(value) || value.length !== snapshot.attachments.length) invalid()
  const expected = new Map(snapshot.attachments.map((item) => [item.id, item]))
  const seen = new Set<string>()
  const files: BackupFileContent[] = []
  for (const row of value) {
    if (!record(row) || !safeId(row.id) || typeof row.content !== 'string') invalid()
    const attachment = expected.get(row.id)
    if (
      !attachment ||
      seen.has(row.id) ||
      base64Size(row.content) !== attachment.size ||
      !validFileHeader(row.content, attachment)
    )
      invalid()
    seen.add(row.id)
    files.push({ id: row.id, content: row.content })
  }
  return files
}

export function createBackup(
  snapshotValue: unknown,
  fileValues: unknown,
  createdAt: string,
): string {
  const snapshot = validateSnapshot(snapshotValue)
  const files = validateFiles(snapshot, fileValues)
  if (!Number.isFinite(Date.parse(createdAt))) invalid()
  const payload = {
    format: 'gearflow-backup' as const,
    version: 2 as const,
    createdAt,
    snapshot,
    files,
  }
  const payloadText = JSON.stringify(payload)
  if (payloadText.length > MAX_BACKUP_BYTES) invalid('备份超过 20 MiB，暂不能合并为一个文件')
  const content = JSON.stringify({ ...payload, checksum: sha256Text(payloadText) })
  if (utf8Size(content) > MAX_BACKUP_BYTES) invalid('备份超过 20 MiB，暂不能合并为一个文件')
  return content
}

export function parseBackup(content: string): BackupBundle {
  if (content.length > MAX_BACKUP_BYTES || utf8Size(content) > MAX_BACKUP_BYTES)
    invalid('备份超过 20 MiB，暂不能导入')
  let input: unknown
  try {
    input = JSON.parse(content)
  } catch {
    invalid()
  }
  if (
    !record(input) ||
    input.format !== 'gearflow-backup' ||
    input.version !== 2 ||
    typeof input.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(input.createdAt)) ||
    typeof input.checksum !== 'string' ||
    !/^[a-f0-9]{64}$/.test(input.checksum)
  )
    invalid()
  const snapshot = validateSnapshot(input.snapshot)
  const files = validateFiles(snapshot, input.files)
  const payload = {
    format: 'gearflow-backup' as const,
    version: 2 as const,
    createdAt: input.createdAt,
    snapshot,
    files,
  }
  if (sha256Text(JSON.stringify(payload)) !== input.checksum)
    invalid('备份内容校验失败，请重新导出')
  return { ...payload, checksum: input.checksum }
}
