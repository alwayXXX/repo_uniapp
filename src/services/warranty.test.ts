import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getWarranty } from './warranty'
import { deviceFixture, warrantyFixture } from '@/test/fixtures'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  limit: vi.fn(),
}))
vi.mock('./auth', () => ({ ensureSession: vi.fn().mockResolvedValue(undefined) }))
vi.mock('./cloudbase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./cloudbase')>()),
  getRdb: () => ({ from: mocks.from }),
}))

const row = {
  id: warrantyFixture.id,
  device_id: warrantyFixture.deviceId,
  user_id: warrantyFixture.userId,
  start_date: warrantyFixture.startDate,
  end_date: warrantyFixture.endDate,
  provider: warrantyFixture.provider,
  scope: warrantyFixture.scope,
  notes: warrantyFixture.notes,
  created_at: warrantyFixture.createdAt,
  updated_at: warrantyFixture.updatedAt,
}

beforeEach(() => {
  vi.resetAllMocks()
  for (const method of [mocks.from, mocks.select, mocks.eq]) method.mockReturnValue(mocks)
})

describe('warranty read safety', () => {
  it('returns null only for an empty successful result', async () => {
    mocks.limit.mockResolvedValueOnce({ data: [], error: null })
    expect(await getWarranty(deviceFixture.id)).toBeNull()
    mocks.limit.mockResolvedValueOnce({ data: [row], error: null })
    expect(await getWarranty(deviceFixture.id)).toEqual(warrantyFixture)
  })

  it('propagates failed reads instead of returning an absent warranty', async () => {
    mocks.limit.mockResolvedValueOnce({ data: null, error: { message: 'synthetic error' } })
    await expect(getWarranty(deviceFixture.id)).rejects.toThrow('读取保修信息失败')
  })

  it.each([
    [null],
    [{}],
    [{ ...row, end_date: undefined }],
    [{ ...row, start_date: 'not-a-date' }],
    [{ ...row, provider: 123 }],
  ])('rejects malformed rows instead of treating them as empty', async (invalid) => {
    mocks.limit.mockResolvedValueOnce({ data: [invalid], error: null })
    await expect(getWarranty(deviceFixture.id)).rejects.toThrow('保修数据格式错误')
  })

  it('supports legacy warranties with a null start date', async () => {
    mocks.limit.mockResolvedValueOnce({ data: [{ ...row, start_date: null }], error: null })
    expect(await getWarranty(deviceFixture.id)).toEqual({ ...warrantyFixture, startDate: null })
  })
})
