import { describe, expect, it } from 'vitest'
import { buildAdvisorFacts, buildAnnualFacts } from './ai-input'
import type { DeviceDoc } from '@/types/device'
import type { MaintenanceDoc, WarrantyDoc } from '@/types/maintenance'
import type { AnnualReport } from '@/types/api/phase11'

const device: DeviceDoc = {
  id: 'device-1',
  userId: 'private-openid',
  categoryId: 'category-1',
  name: 'private-name',
  status: 'IN_USE',
  brand: 'Example',
  model: 'M1',
  serialNumber: 'private-serial',
  purchaseDate: '2024-01-01',
  purchaseChannel: 'private-channel',
  purchasePriceCents: 500000,
  currency: 'CNY',
  notes: 'private-note',
  deletedAt: null,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
}
const warranty: WarrantyDoc = {
  id: 'warranty-1',
  deviceId: 'device-1',
  userId: 'private-openid',
  startDate: null,
  endDate: '2027-01-01',
  provider: 'private-provider',
  scope: null,
  notes: 'private-note',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
}
const record: MaintenanceDoc = {
  id: 'maintenance-1',
  deviceId: 'device-1',
  userId: 'private-openid',
  title: 'private-title',
  type: 'REPAIR',
  occurredAt: '2025-01-01',
  costCents: 1200,
  vendor: 'private-vendor',
  notes: 'private-note',
  createdAt: '2025-01-01',
  updatedAt: '2025-01-01',
}

describe('AI input minimization', () => {
  it('copies only approved device facts and distinguishes missing maintenance costs', () => {
    const facts = buildAdvisorFacts(
      device,
      warranty,
      [record, { ...record, id: '2', costCents: null }],
      '电脑',
      '2026-11-10',
    )
    expect(facts).toMatchObject({
      maintenanceCount: 2,
      knownMaintenanceCents: 1200,
      maintenanceCostUnknownCount: 1,
      warrantyEndDate: '2027-01-01',
    })
    expect(JSON.stringify(facts)).not.toContain('private-')
    expect(JSON.stringify(facts)).not.toContain('500000')
  })

  it('rejects mixed-device or invalid maintenance rather than inventing a total', () => {
    expect(() =>
      buildAdvisorFacts(device, warranty, [{ ...record, deviceId: 'other' }], null, '2026-11-10'),
    ).toThrow()
    expect(() =>
      buildAdvisorFacts(device, warranty, [{ ...record, costCents: -1 }], null, '2026-11-10'),
    ).toThrow()
    expect(() => buildAdvisorFacts(device, warranty, [], null, '2026-02-30')).toThrow()
  })

  it('copies only annual report numbers, keeping a negative net spend', () => {
    const month = {
      purchaseCount: 0,
      purchaseCents: 0,
      maintenanceCount: 0,
      maintenanceCents: 0,
      disposalCount: 0,
      disposalIncomeCents: 0,
      secret: 'private-note',
    }
    const report = {
      year: 2026,
      currency: 'CNY',
      deviceCount: 1,
      purchaseCount: 0,
      maintenanceCount: 0,
      disposalCount: 1,
      purchaseCents: 0,
      maintenanceCents: 0,
      disposalIncomeCents: 100,
      totalSpendCents: 0,
      netSpendCents: -100,
      months: Array.from({ length: 12 }, (_, index) => ({ ...month, month: index + 1 })),
      secret: 'private-name',
    } as AnnualReport
    const facts = buildAnnualFacts(report)
    expect(facts.netSpendCents).toBe(-100)
    expect(JSON.stringify(facts)).not.toContain('private-')
    expect(() => buildAnnualFacts({ ...report, months: report.months.slice(0, 11) })).toThrow()
    expect(() =>
      buildAnnualFacts({ ...report, months: report.months.map((item) => ({ ...item, month: 1 })) }),
    ).toThrow()
  })
})
