import type { DeviceStatus } from '@/types/device'
import type { AnnualMonth } from './phase11'

/** The user reviews these fields before a single AI request. */
export interface AdvisorFacts {
  asOf: string
  category: string | null
  brand: string | null
  model: string | null
  status: DeviceStatus
  purchaseDate: string | null
  warrantyEndDate: string | null
  maintenanceCount: number
  knownMaintenanceCents: number
  maintenanceCostUnknownCount: number
}

/** Values come from the deterministic annual report, not from the model. */
export interface AnnualFacts {
  year: number
  currency: 'CNY'
  deviceCount: number
  purchaseCount: number
  maintenanceCount: number
  disposalCount: number
  purchaseCents: number
  maintenanceCents: number
  disposalIncomeCents: number
  totalSpendCents: number
  netSpendCents: number
  months: AnnualMonth[]
}
