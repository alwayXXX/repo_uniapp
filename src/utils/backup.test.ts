import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createBackup, parseBackup, sha256Text, utf8Size, validateSnapshot } from './backup'

function fixture() {
  const createdAt = '2026-10-01T00:00:00Z'
  return {
    devices: [
      {
        id: 'device-1',
        name: '测试设备',
        status: 'IN_USE',
        categoryId: 'category-1',
        deletedAt: null,
        currency: 'CNY',
        createdAt,
        updatedAt: createdAt,
      },
    ],
    warranties: [
      {
        id: 'warranty-1',
        deviceId: 'device-1',
        endDate: '2027-01-01',
        createdAt,
        updatedAt: createdAt,
      },
    ],
    maintenances: [
      {
        id: 'maintenance-1',
        deviceId: 'device-1',
        title: '清洁',
        type: 'CLEAN',
        occurredAt: '2026-10-01',
        createdAt,
        updatedAt: createdAt,
      },
    ],
    timelines: [
      {
        id: 'timeline-1',
        deviceId: 'device-1',
        eventType: 'CREATED',
        eventDate: '2026-10-01',
        title: '添加设备',
        createdAt,
      },
    ],
    categories: [{ id: 'category-1', code: 'computer', name: '电脑' }],
    attachments: [
      {
        id: 'file-1',
        deviceId: 'device-1',
        name: 'test.png',
        mimeType: 'image/png',
        size: 12,
        createdAt,
      },
    ],
  }
}

describe('versioned backup integrity', () => {
  it('matches standard SHA-256 and UTF-8 encoding, including chunk-boundary emoji', () => {
    for (const value of ['', 'abc', '设备 📱', 'a'.repeat(4095) + '📱', '\ud800']) {
      expect(sha256Text(value)).toBe(createHash('sha256').update(value, 'utf8').digest('hex'))
      expect(utf8Size(value)).toBe(Buffer.byteLength(value, 'utf8'))
    }
  })

  it('round trips device records and attachment content', () => {
    const content = createBackup(
      fixture(),
      [{ id: 'file-1', content: 'iVBORw0KGgoAAAAA' }],
      '2026-11-10T00:00:00Z',
    )
    const parsed = parseBackup(content)
    expect(parsed.snapshot.devices[0]?.name).toBe('测试设备')
    expect(parsed.files).toEqual([{ id: 'file-1', content: 'iVBORw0KGgoAAAAA' }])
    expect(parsed.checksum).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects changed content, missing files, and unknown formats', () => {
    const content = createBackup(
      fixture(),
      [{ id: 'file-1', content: 'iVBORw0KGgoAAAAA' }],
      '2026-11-10T00:00:00Z',
    )
    expect(() => parseBackup(content.replace('测试设备', '其他设备'))).toThrow('校验失败')
    expect(() => createBackup(fixture(), [], '2026-11-10T00:00:00Z')).toThrow('内容不完整')
    expect(() => parseBackup('{"format":"gearflow","version":1}')).toThrow('格式错误')
  })

  it('rejects references to missing devices, duplicate ids and owner/cloud fields', () => {
    const missing = fixture()
    missing.maintenances[0]!.deviceId = 'other-device'
    expect(() => validateSnapshot(missing)).toThrow('格式错误')
    const duplicate = fixture()
    duplicate.devices.push({ ...duplicate.devices[0]! })
    expect(() => validateSnapshot(duplicate)).toThrow('格式错误')
    const unsafe = fixture()
    Object.assign(unsafe.devices[0]!, { openid: 'private' })
    expect(() => validateSnapshot(unsafe)).toThrow('格式错误')
  })

  it('rejects invalid attachment size and content', () => {
    expect(() =>
      createBackup(fixture(), [{ id: 'file-1', content: 'YQ==' }], '2026-11-10T00:00:00Z'),
    ).toThrow()
    expect(() =>
      createBackup(fixture(), [{ id: 'file-1', content: '%%%' }], '2026-11-10T00:00:00Z'),
    ).toThrow()
  })
})
