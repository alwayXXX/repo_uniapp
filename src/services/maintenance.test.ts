import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMaintenance, listAllByDevice, listMaintenancePage } from './maintenance'
import { invalidateClientRequests } from './client-state'
import { deviceFixture, maintenanceFixture } from '@/test/fixtures'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
  limit: vi.fn(),
  ensureSession: vi.fn(),
}))
vi.mock('./auth', () => ({ ensureSession: mocks.ensureSession }))
vi.mock('./cloudbase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./cloudbase')>()),
  getRdb: () => ({ from: mocks.from }),
}))

function row(index: number) {
  const record = maintenanceFixture(index)
  return {
    id: record.id,
    device_id: record.deviceId,
    user_id: record.userId,
    title: record.title,
    type: record.type,
    occurred_at: record.occurredAt,
    cost_cents: record.costCents,
    vendor: record.vendor,
    notes: record.notes,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  }
}
const firstPage = Array.from({ length: 50 }, (_, i) => row(i + 1))
const response = (data: ReturnType<typeof row>[], count: number | null) => ({
  data,
  count,
  error: null,
})

beforeEach(() => {
  vi.resetAllMocks()
  for (const method of [mocks.from, mocks.select, mocks.eq, mocks.order])
    method.mockReturnValue(mocks)
  mocks.ensureSession.mockResolvedValue(undefined)
})

describe('bounded complete maintenance queries', () => {
  it.each([1, 49, 50, 51, 100, 101])(
    'reads all %i records across page boundaries',
    async (total) => {
      const rows = Array.from({ length: total }, (_, i) => row(i + 1))
      mocks.range.mockImplementation(async (from: number, to: number) =>
        response(rows.slice(from, to + 1), total),
      )
      const records = await listAllByDevice(deviceFixture.id)
      expect(records.map((record) => record.id)).toEqual(rows.map((record) => record.id))
      expect(mocks.range).toHaveBeenCalledTimes(Math.ceil(total / 50))
    },
  )

  it('reads every page in a stable order with an exact count', async () => {
    mocks.range
      .mockResolvedValueOnce(response(firstPage, 51))
      .mockResolvedValueOnce(response([row(51)], 51))
    const records = await listAllByDevice(deviceFixture.id)
    expect(records).toHaveLength(51)
    expect(records[50]).toEqual(maintenanceFixture(51))
    expect(mocks.range.mock.calls).toEqual([
      [0, 49],
      [50, 99],
    ])
    expect(mocks.select).toHaveBeenCalledWith('*', { count: 'exact' })
    expect(mocks.order.mock.calls.slice(0, 3)).toEqual([
      ['occurred_at', { ascending: false }],
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ])
  })

  it('looks up an edit target by both IDs without loading a list', async () => {
    mocks.limit.mockResolvedValueOnce({ data: [row(51)], error: null })
    expect(await getMaintenance(deviceFixture.id, 'synthetic-maintenance-51')).toEqual(
      maintenanceFixture(51),
    )
    expect(mocks.eq.mock.calls).toEqual([
      ['device_id', deviceFixture.id],
      ['id', 'synthetic-maintenance-51'],
    ])
    expect(mocks.range).not.toHaveBeenCalled()
  })

  it('returns an empty complete list for no records', async () => {
    mocks.range.mockResolvedValueOnce(response([], 0))
    expect(await listAllByDevice(deviceFixture.id)).toEqual([])
  })

  it('rejects out-of-contract page sizes before accessing the database', async () => {
    await expect(
      listMaintenancePage({ deviceId: deviceFixture.id, page: 1, pageSize: 51 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('fails closed when the exact count is missing', async () => {
    mocks.range.mockResolvedValueOnce(response([row(1)], null))
    await expect(listAllByDevice(deviceFixture.id)).rejects.toThrow('总数缺失')
  })

  it('rejects the whole result when a later page fails', async () => {
    mocks.range
      .mockResolvedValueOnce(response(firstPage, 51))
      .mockResolvedValueOnce({ data: null, error: { message: 'synthetic error' } })
    await expect(listAllByDevice(deviceFixture.id)).rejects.toThrow('读取维护记录失败')
  })

  it.each(['count', 'duplicate', 'empty', 'short'])(
    'rejects an incomplete or changing result: %s',
    async (scenario) => {
      mocks.range.mockResolvedValueOnce(
        response(scenario === 'short' ? firstPage.slice(0, 10) : firstPage, 51),
      )
      mocks.range.mockResolvedValueOnce(
        response(
          scenario === 'empty' ? [] : [row(scenario === 'duplicate' ? 1 : 51)],
          scenario === 'count' ? 52 : 51,
        ),
      )
      await expect(listAllByDevice(deviceFixture.id)).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
      })
      expect(mocks.range).toHaveBeenCalledTimes(2)
    },
  )

  it('cancels remaining pages when the login state changes', async () => {
    mocks.range.mockImplementationOnce(async () => {
      invalidateClientRequests()
      return response(firstPage, 51)
    })
    await expect(listAllByDevice(deviceFixture.id)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(mocks.range).toHaveBeenCalledOnce()
  })
})
