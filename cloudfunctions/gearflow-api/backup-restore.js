const { createHash } = require('node:crypto')
const { decodeAttachment, validDate } = require('./phase11-domain')

module.exports = function createBackupRestore(deps) {
  const { db, storage, fail, selectRows, insertRow, getOwnedDevice, readAll, text, nowValue } = deps

  function sourceId(value) {
    return text(value, 128, 'sourceId', true)
  }

  function object(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('VALIDATION_ERROR')
    return value
  }

  // Stable per owner and original record; never accept a target owner from the client.
  function targetId(owner, type, ...parts) {
    const hash = createHash('sha256')
      .update(JSON.stringify(['gearflow-restore-v2', owner, type, ...parts]))
      .digest('hex')
      .slice(0, 32)
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`
  }

  function date(value, field, required = false) {
    if (value === null || value === undefined || value === '') {
      if (required) fail('VALIDATION_ERROR', `${field} is required`)
      return null
    }
    if (!validDate(value)) fail('VALIDATION_ERROR', `${field} is invalid`)
    return value
  }

  function amount(value) {
    if (value === null || value === undefined) return null
    if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647) fail('VALIDATION_ERROR')
    return value
  }

  function timestamp(value) {
    if (typeof value !== 'string' || value.length > 40) fail('VALIDATION_ERROR')
    const normal = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(value)
      ? `${value.replace(' ', 'T')}Z`
      : value
    const parsed = new Date(normal)
    const milliseconds = parsed.getTime()
    if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 2147483647000)
      fail('VALIDATION_ERROR')
    return parsed.toISOString().slice(0, 23).replace('T', ' ')
  }

  async function findOwned(table, owner, id) {
    const rows = await selectRows(
      db.from(table).select('*').eq('id', id).eq('openid', owner).limit(1),
    )
    return rows[0] || null
  }

  async function insertOnce(table, owner, row) {
    let existing = await findOwned(table, owner, row.id)
    if (existing) return { existing, created: false }
    try {
      await insertRow(table, row)
      return { existing: row, created: true }
    } catch (error) {
      // An earlier request may have committed before the response was lost.
      existing = await findOwned(table, owner, row.id)
      if (existing) return { existing, created: false }
      throw error
    }
  }

  function categoryByCode(categories, code) {
    if (code === null || code === undefined || code === '') return null
    const value = text(code, 32, 'categoryCode', true)
    return (
      categories.find(
        (row) => row.scope === 'SYSTEM' && Number(row.is_active) === 1 && row.code === value,
      ) || undefined
    )
  }

  function stateFor(owner, item, devices, categories) {
    const id = sourceId(item.id)
    const original = devices.find((row) => row.id === id && row.deleted_at == null)
    const restoredId = targetId(owner, 'device', id)
    const restored = devices.find((row) => row.id === restoredId)
    if (original) return { id, state: 'skip' }
    if (restored && restored.deleted_at != null) return { id, state: 'conflict' }
    if (restored) return { id, state: 'resume' }
    if (categoryByCode(categories, item.categoryCode) === undefined)
      return { id, state: 'conflict' }
    return { id, state: 'create' }
  }

  async function preview(owner, payload) {
    if (!Array.isArray(payload.devices) || payload.devices.length > 1000) fail('VALIDATION_ERROR')
    const items = payload.devices.map(object)
    const ids = new Set(items.map((row) => sourceId(row.id)))
    if (ids.size !== items.length) fail('VALIDATION_ERROR')
    const [devices, categories] = await Promise.all([
      readAll('devices', owner),
      readAll('device_categories', null),
    ])
    return { items: items.map((item) => stateFor(owner, item, devices, categories)) }
  }

  async function restorableDevice(owner, originalId) {
    const source = sourceId(originalId)
    const original = await findOwned('devices', owner, source)
    if (original && original.deleted_at == null)
      fail('VALIDATION_ERROR', 'Original device still exists')
    return getOwnedDevice(owner, targetId(owner, 'device', source))
  }

  async function restoreDevice(owner, payload) {
    const item = object(payload.device)
    const id = sourceId(item.id)
    const [devices, categories] = await Promise.all([
      readAll('devices', owner),
      readAll('device_categories', null),
    ])
    const state = stateFor(owner, { id, categoryCode: payload.categoryCode }, devices, categories)
    if (state.state === 'skip' || state.state === 'conflict') return state
    if (state.state === 'resume') return state
    const category = categoryByCode(categories, payload.categoryCode)
    if (category === undefined) fail('CATEGORY_NOT_FOUND')
    const status = text(item.status, 16, 'status', true)
    if (
      !['IN_USE', 'IDLE', 'SOLD', 'DISCARDED'].includes(status) ||
      item.deletedAt != null ||
      item.currency !== 'CNY'
    )
      fail('VALIDATION_ERROR')
    const row = {
      id: targetId(owner, 'device', id),
      openid: owner,
      category_id: category ? category.id : null,
      name: text(item.name, 64, 'name', true),
      status,
      brand: text(item.brand, 64, 'brand'),
      model: text(item.model, 128, 'model'),
      serial_number: text(item.serialNumber, 128, 'serialNumber'),
      purchase_date: date(item.purchaseDate, 'purchaseDate'),
      purchase_channel: text(item.purchaseChannel, 128, 'purchaseChannel'),
      purchase_price_cents: amount(item.purchasePriceCents),
      currency: 'CNY',
      notes: text(item.notes, 1000, 'notes'),
      disposal_date: date(item.disposalDate, 'disposalDate'),
      disposal_price_cents: amount(item.disposalPriceCents),
      disposal_notes: text(item.disposalNotes, 1000, 'disposalNotes'),
      deleted_at: null,
      created_at: timestamp(item.createdAt),
      updated_at: timestamp(item.updatedAt),
    }
    const result = await insertOnce('devices', owner, row)
    if (result.existing.deleted_at != null) return { id, state: 'conflict' }
    return { id, state: result.created ? 'created' : 'resume' }
  }

  async function restoreWarranty(owner, payload) {
    const item = object(payload.item)
    const source = sourceId(payload.sourceDeviceId)
    if (item.deviceId !== source) fail('VALIDATION_ERROR')
    const device = await restorableDevice(owner, source)
    const start = date(item.startDate, 'startDate')
    const end = date(item.endDate, 'endDate', true)
    if (start && end < start) fail('VALIDATION_ERROR')
    const row = {
      id: targetId(owner, 'warranty', source, sourceId(item.id)),
      device_id: device.id,
      openid: owner,
      start_date: start,
      end_date: end,
      provider: text(item.provider, 128, 'provider'),
      scope: text(item.scope, 128, 'scope'),
      notes: text(item.notes, 1000, 'notes'),
      created_at: timestamp(item.createdAt),
      updated_at: timestamp(item.updatedAt),
    }
    const previous = await selectRows(
      db.from('warranties').select('*').eq('device_id', device.id).eq('openid', owner).limit(1),
    )
    if (previous.length) return { state: previous[0].id === row.id ? 'exists' : 'conflict' }
    const result = await insertOnce('warranties', owner, row)
    if (result.existing.device_id !== device.id) fail('VALIDATION_ERROR')
    return { state: result.created ? 'created' : 'exists' }
  }

  async function restoreMaintenance(owner, payload) {
    const item = object(payload.item)
    const source = sourceId(payload.sourceDeviceId)
    if (item.deviceId !== source) fail('VALIDATION_ERROR')
    const device = await restorableDevice(owner, source)
    const type = text(item.type, 16, 'type', true)
    if (!['REPAIR', 'UPGRADE', 'CLEAN', 'REPLACE', 'INSPECT', 'OTHER'].includes(type))
      fail('VALIDATION_ERROR')
    const row = {
      id: targetId(owner, 'maintenance', source, sourceId(item.id)),
      device_id: device.id,
      openid: owner,
      title: text(item.title, 64, 'title', true),
      type,
      occurred_at: date(item.occurredAt, 'occurredAt', true),
      cost_cents: amount(item.costCents),
      vendor: text(item.vendor, 128, 'vendor'),
      notes: text(item.notes, 1000, 'notes'),
      created_at: timestamp(item.createdAt),
      updated_at: timestamp(item.updatedAt),
    }
    const saved = await insertOnce('maintenance_records', owner, row)
    if (saved.existing.device_id !== device.id) fail('VALIDATION_ERROR')
    const savedCost = saved.existing.cost_cents == null ? null : Number(saved.existing.cost_cents)
    if (savedCost !== row.cost_cents || saved.existing.occurred_at !== row.occurred_at)
      return { state: 'conflict' }
    if (row.cost_cents !== null) {
      const costs = await selectRows(
        db
          .from('device_costs')
          .select('*')
          .eq('maintenance_id', row.id)
          .eq('openid', owner)
          .limit(1),
      )
      if (
        costs.length &&
        (costs[0].device_id !== device.id ||
          costs[0].cost_type !== 'MAINTENANCE' ||
          Number(costs[0].amount_cents) !== row.cost_cents ||
          costs[0].occurred_at !== row.occurred_at)
      )
        return { state: 'conflict' }
      if (!costs.length)
        await insertOnce('device_costs', owner, {
          id: targetId(owner, 'cost', source, sourceId(item.id)),
          device_id: device.id,
          openid: owner,
          cost_type: 'MAINTENANCE',
          amount_cents: row.cost_cents,
          occurred_at: row.occurred_at,
          maintenance_id: row.id,
          created_at: row.created_at,
        })
    }
    return { state: saved.created ? 'created' : 'exists' }
  }

  async function restoreTimeline(owner, payload) {
    const item = object(payload.item)
    const source = sourceId(payload.sourceDeviceId)
    if (item.deviceId !== source) fail('VALIDATION_ERROR')
    const device = await restorableDevice(owner, source)
    const type = text(item.eventType, 24, 'eventType', true)
    if (!['CREATED', 'UPDATED', 'MAINTENANCE', 'WARRANTY', 'DISPOSED'].includes(type))
      fail('VALIDATION_ERROR')
    let details = item.payload
    if (typeof details === 'string') {
      try {
        details = JSON.parse(details)
      } catch {
        fail('VALIDATION_ERROR')
      }
    }
    if (details == null) details = {}
    object(details)
    const fields = details.changedFields === undefined ? [] : details.changedFields
    if (
      !Array.isArray(fields) ||
      fields.length > 50 ||
      fields.some(
        (field) => typeof field !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(field),
      )
    )
      fail('VALIDATION_ERROR')
    const row = {
      id: targetId(owner, 'timeline', source, sourceId(item.id)),
      device_id: device.id,
      openid: owner,
      event_type: type,
      event_date: date(item.eventDate, 'eventDate', true),
      title: text(item.title, 128, 'title', true),
      description: text(item.description, 255, 'description'),
      payload: JSON.stringify({ changedFields: fields }),
      created_at: timestamp(item.createdAt),
    }
    const result = await insertOnce('device_timelines', owner, row)
    if (result.existing.device_id !== device.id) fail('VALIDATION_ERROR')
    return { state: result.created ? 'created' : 'exists' }
  }

  async function restoreAttachment(owner, payload) {
    const item = object(payload.item)
    const source = sourceId(payload.sourceDeviceId)
    if (item.deviceId !== source) fail('VALIDATION_ERROR')
    const device = await restorableDevice(owner, source)
    const name = text(item.name, 128, 'name', true)
    if (/[\\/\x00-\x1f]/.test(name)) fail('VALIDATION_ERROR')
    const originalCreated = timestamp(item.createdAt)
    let file
    try {
      file = decodeAttachment(payload.content, name)
    } catch {
      fail('VALIDATION_ERROR')
    }
    if (item.mimeType !== file.mimeType || item.size !== file.bytes.length) fail('VALIDATION_ERROR')
    const digest = createHash('sha256').update(file.bytes).digest('hex')
    const id = targetId(owner, 'attachment', source, sourceId(item.id), digest)
    let row = await findOwned('device_attachments', owner, id)
    if (row && row.device_id !== device.id) fail('VALIDATION_ERROR')
    if (row && row.status === 'READY') return { state: 'exists' }
    if (row && row.status !== 'UPLOADING') fail('RATE_LIMITED')
    if (!row) {
      const existing = await readAll('device_attachments', owner, 'device_id', device.id)
      if (existing.length >= 10) fail('VALIDATION_ERROR', 'Attachment limit reached')
      const slot = Array.from({ length: 10 }, (_, index) => index).find(
        (index) => !existing.some((entry) => entry.slot === index),
      )
      const cloudPath = `gearflow-private/${createHash('sha256').update(owner).digest('hex').slice(0, 32)}/restore-${id}.${file.extension}`
      const metadata = await storage.getUploadMetadata({ cloudPath })
      const fileID =
        metadata.fileID ||
        metadata.fileId ||
        (metadata.data && (metadata.data.fileID || metadata.data.fileId))
      if (typeof fileID !== 'string') fail('INTERNAL_ERROR')
      const candidate = {
        id,
        slot,
        openid: owner,
        device_id: device.id,
        name,
        mime_type: file.mimeType,
        size_bytes: file.bytes.length,
        cloud_path: cloudPath,
        file_id: fileID,
        status: 'UPLOADING',
        created_at: nowValue(),
      }
      const saved = await insertOnce('device_attachments', owner, candidate)
      row = saved.existing
      if (row.status === 'READY') return { state: 'exists' }
    }
    if (
      row.device_id !== device.id ||
      row.status !== 'UPLOADING' ||
      row.name !== name ||
      row.mime_type !== file.mimeType ||
      Number(row.size_bytes) !== file.bytes.length ||
      typeof row.file_id !== 'string'
    )
      fail('VALIDATION_ERROR')
    const uploaded = await storage.uploadFile({
      cloudPath: row.cloud_path,
      fileContent: file.bytes,
    })
    if (!uploaded || uploaded.fileID !== row.file_id) fail('INTERNAL_ERROR')
    await getOwnedDevice(owner, device.id)
    const ready = await selectRows(
      db
        .from('device_attachments')
        .update({ status: 'READY', created_at: originalCreated })
        .eq('id', id)
        .eq('openid', owner)
        .eq('status', 'UPLOADING')
        .select('id'),
    )
    if (!ready.length) fail('INTERNAL_ERROR')
    return { state: 'created' }
  }

  async function route(owner, action, payload) {
    switch (action) {
      case 'backup.restore.preview':
        return preview(owner, payload)
      case 'backup.restore.device':
        return restoreDevice(owner, payload)
      case 'backup.restore.warranty':
        return restoreWarranty(owner, payload)
      case 'backup.restore.maintenance':
        return restoreMaintenance(owner, payload)
      case 'backup.restore.timeline':
        return restoreTimeline(owner, payload)
      case 'backup.restore.attachment':
        return restoreAttachment(owner, payload)
      default:
        fail('VALIDATION_ERROR', 'Unknown restore action')
    }
  }
  return { route }
}
