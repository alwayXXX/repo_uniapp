import type { DeviceDoc } from '@/types/device'
import type { MaintenanceDoc, WarrantyDoc } from '@/types/maintenance'

export const deviceFixture: DeviceDoc = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: 'synthetic-user',
  categoryId: '22222222-2222-4222-8222-222222222222',
  name: 'Test device',
  status: 'IN_USE',
  brand: null,
  model: null,
  serialNumber: null,
  purchaseDate: '2026-01-01',
  purchaseChannel: null,
  purchasePriceCents: 10000,
  currency: 'CNY',
  notes: null,
  deletedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

export const warrantyFixture: WarrantyDoc = {
  id: 'synthetic-warranty',
  deviceId: deviceFixture.id,
  userId: deviceFixture.userId,
  startDate: '2026-01-01',
  endDate: '2027-01-01',
  provider: 'Test provider',
  scope: null,
  notes: null,
  createdAt: deviceFixture.createdAt,
  updatedAt: deviceFixture.updatedAt,
}

export function maintenanceFixture(index: number): MaintenanceDoc {
  return {
    id: `synthetic-maintenance-${index}`,
    deviceId: deviceFixture.id,
    userId: deviceFixture.userId,
    title: `Maintenance ${index}`,
    type: 'REPAIR',
    occurredAt: '2026-02-01',
    costCents: 100,
    vendor: null,
    notes: null,
    createdAt: deviceFixture.createdAt,
    updatedAt: deviceFixture.updatedAt,
  }
}
