import type { AdvisorFacts, AnnualFacts } from '@/types/api/ai'
import type { AnnualReport } from '@/types/api/phase11'
import type { DeviceDoc } from '@/types/device'
import type { MaintenanceDoc, WarrantyDoc } from '@/types/maintenance'
import { AppError } from './error'

function fail(): never {
  throw new AppError('VALIDATION_ERROR', '数据不完整，暂时无法生成 AI 摘要')
}

function date(value: string | null): string | null {
  if (value === null) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail()
  const parsed = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    return fail()
  return value
}

function number(value: number, allowNegative = false): number {
  if (!Number.isSafeInteger(value) || (!allowNegative && value < 0)) return fail()
  return value
}

/** Never spread a device or maintenance record into the model request. */
export function buildAdvisorFacts(
  device: DeviceDoc,
  warranty: WarrantyDoc | null,
  maintenance: MaintenanceDoc[],
  category: string | null,
  asOf: string,
): AdvisorFacts {
  if (
    device.deletedAt ||
    device.currency !== 'CNY' ||
    (warranty && warranty.deviceId !== device.id)
  )
    return fail()
  let knownMaintenanceCents = 0
  let maintenanceCostUnknownCount = 0
  for (const record of maintenance) {
    if (record.deviceId !== device.id) return fail()
    if (record.costCents === null) maintenanceCostUnknownCount++
    else knownMaintenanceCents = number(knownMaintenanceCents + number(record.costCents))
  }
  return {
    asOf: date(asOf) ?? fail(),
    category,
    brand: device.brand,
    model: device.model,
    status: device.status,
    purchaseDate: date(device.purchaseDate),
    warrantyEndDate: warranty ? date(warranty.endDate) : null,
    maintenanceCount: maintenance.length,
    knownMaintenanceCents,
    maintenanceCostUnknownCount,
  }
}

/** Copy each report field explicitly; never include additional runtime properties. */
export function buildAnnualFacts(report: AnnualReport): AnnualFacts {
  if (report.currency !== 'CNY' || !Array.isArray(report.months) || report.months.length !== 12)
    return fail()
  const seen = new Set<number>()
  const months = report.months.map((row) => {
    if (!Number.isInteger(row.month) || row.month < 1 || row.month > 12 || seen.has(row.month))
      return fail()
    seen.add(row.month)
    return {
      month: row.month,
      purchaseCount: number(row.purchaseCount),
      purchaseCents: number(row.purchaseCents),
      maintenanceCount: number(row.maintenanceCount),
      maintenanceCents: number(row.maintenanceCents),
      disposalCount: number(row.disposalCount),
      disposalIncomeCents: number(row.disposalIncomeCents),
    }
  })
  if (!Number.isInteger(report.year) || report.year < 1970 || report.year > 9999) return fail()
  return {
    year: report.year,
    currency: 'CNY',
    deviceCount: number(report.deviceCount),
    purchaseCount: number(report.purchaseCount),
    maintenanceCount: number(report.maintenanceCount),
    disposalCount: number(report.disposalCount),
    purchaseCents: number(report.purchaseCents),
    maintenanceCents: number(report.maintenanceCents),
    disposalIncomeCents: number(report.disposalIncomeCents),
    totalSpendCents: number(report.totalSpendCents),
    netSpendCents: number(report.netSpendCents, true),
    months,
  }
}
