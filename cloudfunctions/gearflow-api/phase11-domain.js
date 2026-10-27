const MAX_FILE_BYTES = 2 * 1024 * 1024

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function annualReport(year, devices, maintenance, today) {
  if (!Number.isInteger(year) || year < 1970 || year > Number(today.slice(0, 4))) {
    throw new Error('INVALID_YEAR')
  }
  const live = devices.filter((row) => row.deleted_at == null)
  const ids = new Set(live.map((row) => row.id))
  const months = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    purchaseCount: 0,
    purchaseCents: 0,
    maintenanceCount: 0,
    maintenanceCents: 0,
    disposalCount: 0,
    disposalIncomeCents: 0,
  }))
  function monthOf(date) {
    return validDate(date) && date.slice(0, 4) === String(year) && date <= today
      ? months[Number(date.slice(5, 7)) - 1]
      : null
  }
  function money(value) {
    if (value == null) return 0
    const amount = Number(value)
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('INVALID_AMOUNT')
    return amount
  }
  for (const row of live) {
    if ((row.currency || 'CNY') !== 'CNY') throw new Error('UNSUPPORTED_CURRENCY')
    const purchase = monthOf(row.purchase_date)
    if (purchase) {
      purchase.purchaseCount += 1
      purchase.purchaseCents += money(row.purchase_price_cents)
    }
    const disposal = monthOf(row.disposal_date)
    if (disposal && ['SOLD', 'DISCARDED'].includes(row.status)) {
      disposal.disposalCount += 1
      disposal.disposalIncomeCents += money(row.disposal_price_cents)
    }
  }
  for (const row of maintenance) {
    const month = monthOf(row.occurred_at)
    if (!ids.has(row.device_id) || !month) continue
    month.maintenanceCount += 1
    month.maintenanceCents += money(row.cost_cents)
  }
  const result = { year, currency: 'CNY', deviceCount: live.length, months }
  for (const key of [
    'purchaseCount',
    'purchaseCents',
    'maintenanceCount',
    'maintenanceCents',
    'disposalCount',
    'disposalIncomeCents',
  ]) {
    result[key] = months.reduce((sum, month) => sum + month[key], 0)
    if (!Number.isSafeInteger(result[key])) throw new Error('INVALID_AMOUNT')
  }
  result.totalSpendCents = result.purchaseCents + result.maintenanceCents
  result.netSpendCents = result.totalSpendCents - result.disposalIncomeCents
  return result
}

function decodeAttachment(encoded, name) {
  if (
    typeof encoded !== 'string' ||
    encoded.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 ||
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
  ) {
    throw new Error('INVALID_FILE')
  }
  const bytes = Buffer.from(encoded, 'base64')
  if (!bytes.length || bytes.length > MAX_FILE_BYTES || bytes.toString('base64') !== encoded)
    throw new Error('INVALID_FILE')
  let extension = ''
  let mimeType = ''
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    extension = 'png'
    mimeType = 'image/png'
  } else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    extension = 'jpg'
    mimeType = 'image/jpeg'
  } else if (
    bytes.subarray(0, 4).toString() === 'RIFF' &&
    bytes.subarray(8, 12).toString() === 'WEBP'
  ) {
    extension = 'webp'
    mimeType = 'image/webp'
  } else if (bytes.subarray(0, 5).toString() === '%PDF-') {
    extension = 'pdf'
    mimeType = 'application/pdf'
  }
  const supplied = typeof name === 'string' ? name.split('.').pop().toLowerCase() : ''
  if (!extension || !(extension === 'jpg' ? ['jpg', 'jpeg'] : [extension]).includes(supplied))
    throw new Error('INVALID_FILE')
  return { bytes, extension, mimeType }
}

module.exports = { annualReport, decodeAttachment, validDate, MAX_FILE_BYTES }
