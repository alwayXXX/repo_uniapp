export interface DisposeDeviceRequest {
  deviceId: string
  status: 'SOLD' | 'DISCARDED'
  date: string
  priceCents: number | null
  notes: string
}

export interface AnnualMonth {
  month: number
  purchaseCount: number
  purchaseCents: number
  maintenanceCount: number
  maintenanceCents: number
  disposalCount: number
  disposalIncomeCents: number
}

export interface AnnualReport {
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

export interface AttachmentItem {
  id: string
  name: string
  mimeType: string
  size: number
  createdAt: string
}

export type ReminderStatus = 'PENDING' | 'SENDING' | 'SENT' | 'CANCELLED' | 'FAILED' | 'UNKNOWN'

export interface ReminderItem {
  id: string
  remindOn: string
  warrantyEnd: string
  status: ReminderStatus
}

export interface ReminderConfig {
  available: boolean
  templateId: string | null
  reason?: 'PLATFORM_UNAVAILABLE' | 'NO_TEMPLATE' | null
  reasonCode?: string | number | null
}

export interface JsonExport {
  format: 'gearflow'
  version: 1
  exportedAt: string
  devices: Array<Record<string, unknown>>
  warranties: Array<Record<string, unknown>>
  maintenances: Array<Record<string, unknown>>
}
