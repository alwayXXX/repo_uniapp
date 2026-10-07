import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getWarranty, listWarranties } from './warranty'
import { deviceFixture, warrantyFixture } from '@/test/fixtures'

const mocks = vi.hoisted(() => ({
  callGearFlowApi: vi.fn(),
}))

vi.mock('./auth', () => ({ ensureSession: vi.fn().mockResolvedValue(undefined) }))
vi.mock('./cloudbase', () => ({ callGearFlowApi: mocks.callGearFlowApi }))

beforeEach(() => {
  vi.resetAllMocks()
})

describe('warranty cloud-function adapter', () => {
  it('returns null only when the function returns no warranty', async () => {
    mocks.callGearFlowApi.mockResolvedValueOnce({ item: null })
    await expect(getWarranty(deviceFixture.id)).resolves.toBeNull()
  })

  it('maps a valid warranty response', async () => {
    mocks.callGearFlowApi.mockResolvedValueOnce({ item: warrantyFixture })
    await expect(getWarranty(deviceFixture.id)).resolves.toEqual(warrantyFixture)
  })

  it('fails closed for malformed warranty data', async () => {
    mocks.callGearFlowApi.mockResolvedValueOnce({ item: { id: 'broken' } })
    await expect(getWarranty(deviceFixture.id)).rejects.toThrow('保修数据格式错误')
  })

  it('rejects malformed list entries instead of hiding them', async () => {
    mocks.callGearFlowApi.mockResolvedValueOnce({ items: [warrantyFixture, { id: 'broken' }] })
    await expect(listWarranties()).rejects.toThrow('保修数据格式错误')
  })
})
