import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMaintenance, listAllByDevice, listMaintenancePage } from './maintenance'
import { deviceFixture } from '@/test/fixtures'
import { invalidateClientRequests } from './client-state'
import type { MaintenanceDoc } from '@/types/maintenance'

const mocks = vi.hoisted(() => ({
  callGearFlowApi: vi.fn(),
}))

vi.mock('./auth', () => ({ ensureSession: vi.fn().mockResolvedValue(undefined) }))
vi.mock('./cloudbase', () => ({ callGearFlowApi: mocks.callGearFlowApi }))

function row(index: number): MaintenanceDoc {
  return {
    id: `m-${String(index).padStart(4, '0')}`,
    deviceId: deviceFixture.id,
    userId: 'openid-test',
    title: `维护 ${index}`,
    type: 'INSPECT',
    occurredAt: '2026-09-01',
    costCents: null,
    vendor: null,
    notes: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  }
}

function pageResponse(total: number, page: number, pageSize = 50) {
  const records = Array.from({ length: total }, (_, index) => row(index + 1))
  const from = (page - 1) * pageSize
  return {
    items: records.slice(from, from + pageSize),
    page,
    pageSize,
    total,
    hasMore: from + pageSize < total,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  invalidateClientRequests()
})

describe('bounded complete maintenance queries', () => {
  it.each([1, 49, 50, 51, 100, 101])('reads all %i records across pages', async (total) => {
    mocks.callGearFlowApi.mockImplementation(async (_action, payload) =>
      pageResponse(total, Number(payload.page), Number(payload.pageSize)),
    )
    await expect(listAllByDevice(deviceFixture.id)).resolves.toHaveLength(total)
  })

  it('returns an exact page and total from the function', async () => {
    mocks.callGearFlowApi.mockResolvedValueOnce(pageResponse(75, 2))
    await expect(
      listMaintenancePage({ deviceId: deviceFixture.id, page: 2, pageSize: 50 }),
    ).resolves.toMatchObject({ page: 2, total: 75, hasMore: false })
  })

  it('fetches an edit target by device and record IDs', async () => {
    mocks.callGearFlowApi.mockResolvedValueOnce({ item: row(7) })
    await expect(getMaintenance(deviceFixture.id, row(7).id)).resolves.toEqual(row(7))
    expect(mocks.callGearFlowApi).toHaveBeenCalledWith('maintenance.get', {
      deviceId: deviceFixture.id,
      id: row(7).id,
    })
  })

  it('fails closed on a missing total', async () => {
    mocks.callGearFlowApi.mockResolvedValueOnce({
      items: [row(1)],
      page: 1,
      pageSize: 50,
      hasMore: false,
    })
    await expect(listAllByDevice(deviceFixture.id)).rejects.toThrow('维护记录不完整')
  })

  it('fails closed on a malformed row', async () => {
    mocks.callGearFlowApi.mockResolvedValueOnce({
      items: [{ id: 'broken' }],
      page: 1,
      pageSize: 50,
      total: 1,
      hasMore: false,
    })
    await expect(listAllByDevice(deviceFixture.id)).rejects.toThrow('维护记录数据格式错误')
  })

  it('cancels pagination when login state changes', async () => {
    mocks.callGearFlowApi.mockImplementationOnce(() => {
      invalidateClientRequests()
      return pageResponse(51, 1)
    })
    await expect(listAllByDevice(deviceFixture.id)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})
