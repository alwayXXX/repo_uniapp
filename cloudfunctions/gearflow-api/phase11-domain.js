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

function reminderTemplate(template) {
  if (
    Number(template.type) !== 2 ||
    !/保修|到期|^待办事项提醒$/.test(template.title || '') ||
    typeof template.priTmplId !== 'string' ||
    !template.priTmplId
  )
    return null
  const fields = String(template.content || '')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const match = line.match(/^\s*([^{}]+?)\s*\{\{([a-z]+\d+)\.DATA\}\}\s*$/)
      return match ? { label: match[1].replace(/[\s:：]/g, ''), field: match[2] } : null
    })
  if (!fields.length || fields.some((field) => !field)) return null
  if (new Set(fields.map((field) => field.field)).size !== fields.length) return null
  const names = fields.filter((field) => /设备|物品|商品|^提醒内容$/.test(field.label))
  if (names.length !== 1 || !/^thing\d+$/.test(names[0].field)) return null
  const name = names[0]
  const dates = fields.filter((field) => field !== name && /到期|保修|截止/.test(field.label))
  if (dates.length !== 1 || !/^(date|time)\d+$/.test(dates[0].field)) return null
  const date = dates[0]
  const extras = fields.filter((field) => field !== name && field !== date)
  if (
    !extras.every(
      (field) =>
        /^(thing|phrase)\d+$/.test(field.field) ||
        (/^(date|time)\d+$/.test(field.field) && /^提醒(?:时间|日期)$/.test(field.label)),
    )
  )
    return null
  return {
    templateId: template.priTmplId,
    device: name.field,
    date: date.field,
    extras: extras.map((field) => field.field),
    content: name.label === '提醒内容',
  }
}

function reminderData(row, deviceName, utcNow) {
  const metadata =
    typeof row.extra_fields === 'string' ? JSON.parse(row.extra_fields) : row.extra_fields
  const fields = Array.isArray(metadata) ? metadata : metadata?.fields || []
  if (
    !Array.isArray(fields) ||
    new Set(fields).size !== fields.length ||
    fields.includes(row.device_field) ||
    fields.includes(row.date_field) ||
    !validDate(row.warranty_end)
  )
    throw new Error('INVALID_TEMPLATE')
  const beijing = new Date(Date.parse(`${utcNow.replace(' ', 'T')}Z`) + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16)
    .replace('T', ' ')
  const data = {}
  for (const field of fields) {
    if (typeof field !== 'string' || !/^(thing|phrase|time|date)\d+$/.test(field))
      throw new Error('INVALID_TEMPLATE')
    const value = /^time/.test(field)
      ? beijing
      : /^date/.test(field)
        ? beijing.slice(0, 10)
        : /^phrase/.test(field)
          ? '保修提醒'
          : '请及时查看设备保修状态'
    data[field] = { value }
  }
  if (!/^thing\d+$/.test(row.device_field) || !/^(date|time)\d+$/.test(row.date_field))
    throw new Error('INVALID_TEMPLATE')
  data[row.device_field] = {
    value:
      metadata?.content === true
        ? `${[...deviceName].slice(0, 14).join('')}保修即将到期`
        : [...deviceName].slice(0, 20).join(''),
  }
  data[row.date_field] = {
    value: /^time/.test(row.date_field) ? `${row.warranty_end} 23:59` : row.warranty_end,
  }
  return data
}

module.exports = {
  annualReport,
  decodeAttachment,
  validDate,
  reminderTemplate,
  reminderData,
  MAX_FILE_BYTES,
}
