const { randomUUID } = require('node:crypto')
const cloudbase = require('@cloudbase/node-sdk')
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// Resolve the environment ID from the current Event Function context.
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV })
const db = app.rdb()
const createPhase11 = require('./phase11')
const { isTimerInvocation } = require('./phase11-domain')

const DEVICE_STATUSES = ['IN_USE', 'IDLE', 'SOLD', 'DISCARDED']
const MAINTENANCE_TYPES = ['REPAIR', 'UPGRADE', 'CLEAN', 'REPLACE', 'INSPECT', 'OTHER']

class ApiFailure extends Error {
  constructor(code, message) {
    super(message || code)
    this.code = code
  }
}

function fail(code, message) {
  throw new ApiFailure(code, message)
}

function text(value, maxLength, field, required = false) {
  if (value === null || value === undefined) {
    if (required) fail('VALIDATION_ERROR', `${field} is required`)
    return null
  }
  if (typeof value !== 'string') fail('VALIDATION_ERROR', `${field} is invalid`)
  const next = value.trim()
  if (!next) {
    if (required) fail('VALIDATION_ERROR', `${field} is required`)
    return null
  }
  if (next.length > maxLength) fail('VALIDATION_ERROR', `${field} is too long`)
  return next
}

function optionalDate(value, field) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail('VALIDATION_ERROR', `${field} is invalid`)
  }
  const parsed = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    fail('VALIDATION_ERROR', `${field} is invalid`)
  return value
}

function requiredDate(value, field) {
  const date = optionalDate(value, field)
  if (!date) fail('VALIDATION_ERROR', `${field} is required`)
  return date
}

function optionalNonNegativeInt(value, field) {
  if (value === null || value === undefined || value === '') return null
  if (!Number.isInteger(value) || value < 0 || value > 2147483647)
    fail('VALIDATION_ERROR', `${field} is invalid`)
  return value
}

function todayString() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function nowValue() {
  return new Date().toISOString().slice(0, 23).replace('T', ' ')
}

function isDeleted(row) {
  return row && row.deleted_at !== null && row.deleted_at !== undefined
}

async function selectRows(query, message = 'Database query failed') {
  const result = await query
  if (result && result.error) {
    console.error(
      'gearflow-api database error:',
      JSON.stringify({
        code: result.error.code || null,
      }),
    )
    throw new Error(message)
  }
  const data = result && result.data
  if (data === null || data === undefined) return []
  return Array.isArray(data) ? data : [data]
}

async function insertRow(table, data, message = 'Database insert failed') {
  const result = await db.from(table).insert(data)
  if (result && result.error) {
    throw new Error(`${message}: ${result.error.code || result.error.message || 'unknown error'}`)
  }
  return data
}

async function updateRows(query, message = 'Database update failed') {
  const result = await query
  if (result && result.error) {
    throw new Error(`${message}: ${result.error.code || result.error.message || 'unknown error'}`)
  }
}

async function deleteRows(query, message = 'Database delete failed') {
  const result = await query
  if (result && result.error) {
    throw new Error(`${message}: ${result.error.code || result.error.message || 'unknown error'}`)
  }
}

async function findUser(openid) {
  const rows = await selectRows(
    db.from('users').select('*').eq('openid', openid).limit(1),
    'Failed to read user',
  )
  return rows[0] || null
}

function mapUser(row) {
  return {
    id: row.id,
    nickname: typeof row.nickname === 'string' ? row.nickname : null,
    avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : null,
  }
}

function mapDevice(row) {
  return {
    id: row.id,
    userId: row.openid,
    categoryId: row.category_id || null,
    name: row.name,
    status: DEVICE_STATUSES.includes(row.status) ? row.status : 'IN_USE',
    brand: row.brand || null,
    model: row.model || null,
    serialNumber: row.serial_number || null,
    purchaseDate: row.purchase_date || null,
    purchaseChannel: row.purchase_channel || null,
    purchasePriceCents:
      row.purchase_price_cents === null || row.purchase_price_cents === undefined
        ? null
        : Number(row.purchase_price_cents),
    currency: row.currency || 'CNY',
    notes: row.notes || null,
    disposalDate: row.disposal_date || null,
    disposalPriceCents: row.disposal_price_cents == null ? null : Number(row.disposal_price_cents),
    disposalNotes: row.disposal_notes || null,
    deletedAt: row.deleted_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapWarranty(row) {
  return {
    id: row.id,
    deviceId: row.device_id,
    userId: row.openid,
    startDate: row.start_date || null,
    endDate: row.end_date,
    provider: row.provider || null,
    scope: row.scope || null,
    notes: row.notes || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapMaintenance(row) {
  return {
    id: row.id,
    deviceId: row.device_id,
    userId: row.openid,
    title: row.title,
    type: MAINTENANCE_TYPES.includes(row.type) ? row.type : 'OTHER',
    occurredAt: row.occurred_at,
    costCents:
      row.cost_cents === null || row.cost_cents === undefined ? null : Number(row.cost_cents),
    vendor: row.vendor || null,
    notes: row.notes || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapTimeline(row) {
  return {
    id: row.id,
    deviceId: row.device_id,
    eventType: row.event_type,
    eventDate: row.event_date,
    title: row.title,
    description: row.description || null,
    payload: row.payload || null,
    createdAt: row.created_at,
  }
}

async function appendTimeline(openid, deviceId, eventType, eventDate, title, description, payload) {
  await insertRow('device_timelines', {
    id: randomUUID(),
    device_id: deviceId,
    openid,
    event_type: eventType,
    event_date: eventDate,
    title: title.slice(0, 128),
    description: description ? description.slice(0, 255) : null,
    payload: JSON.stringify(payload || {}),
  })
}

async function getOwnedDevice(openid, deviceId) {
  if (!deviceId || typeof deviceId !== 'string') fail('DEVICE_NOT_FOUND')
  const rows = await selectRows(
    db.from('devices').select('*').eq('id', deviceId).eq('openid', openid).limit(1),
    'Failed to read device',
  )
  const row = rows[0]
  if (!row || isDeleted(row)) fail('DEVICE_NOT_FOUND')
  return row
}

async function bootstrapUser(openid, payload) {
  const privacyVersion = text(payload.privacyVersion, 32, 'privacyVersion', true)
  const termsVersion = text(payload.termsVersion, 32, 'termsVersion', true)
  let row = await findUser(openid)
  let isNewUser = false

  if (!row) {
    isNewUser = true
    row = {
      id: randomUUID(),
      openid,
      nickname: null,
      avatar_url: null,
      status: 'ACTIVE',
      last_login_at: nowValue(),
      created_at: nowValue(),
      updated_at: nowValue(),
    }
    await insertRow('users', row, 'Failed to create user')
  } else {
    await updateRows(
      db
        .from('users')
        .update({ last_login_at: nowValue(), updated_at: nowValue() })
        .eq('id', row.id),
      'Failed to update login time',
    )
  }

  const existingConsent = await selectRows(
    db
      .from('consent_records')
      .select('*')
      .eq('openid', openid)
      .eq('policy_type', 'PRIVACY')
      .eq('policy_version', privacyVersion)
      .limit(1),
    'Failed to read consent',
  )
  if (existingConsent.length === 0) {
    await insertRow('consent_records', {
      id: randomUUID(),
      openid,
      policy_type: 'PRIVACY',
      policy_version: privacyVersion,
      consented_at: nowValue(),
    })
  }

  const existingTerms = await selectRows(
    db
      .from('consent_records')
      .select('*')
      .eq('openid', openid)
      .eq('policy_type', 'TERMS')
      .eq('policy_version', termsVersion)
      .limit(1),
    'Failed to read consent',
  )
  if (existingTerms.length === 0) {
    await insertRow('consent_records', {
      id: randomUUID(),
      openid,
      policy_type: 'TERMS',
      policy_version: termsVersion,
      consented_at: nowValue(),
    })
  }

  return { user: { ...mapUser(row), isNewUser } }
}

async function updateProfile(openid, payload) {
  const user = await findUser(openid)
  if (!user) fail('UNAUTHORIZED')
  const nickname = text(payload.nickname, 64, 'nickname')
  const avatarUrl = text(payload.avatarUrl, 512, 'avatarUrl')
  await updateRows(
    db
      .from('users')
      .update({ nickname, avatar_url: avatarUrl, updated_at: nowValue() })
      .eq('id', user.id),
    'Failed to update profile',
  )
  return { ok: true }
}

async function deleteAccount(openid) {
  const user = await findUser(openid)
  if (!user) return { status: 'NOT_FOUND', deletedAt: null }

  await phase11.cancelReminders(openid)
  await phase11.cleanupAttachments(openid)
  await deleteRows(db.from('device_reminders').delete().eq('openid', openid))

  await deleteRows(db.from('warranties').delete().eq('openid', openid))
  await deleteRows(db.from('device_costs').delete().eq('openid', openid))
  await deleteRows(db.from('maintenance_records').delete().eq('openid', openid))
  await deleteRows(db.from('device_timelines').delete().eq('openid', openid))
  await deleteRows(db.from('devices').delete().eq('openid', openid))
  await deleteRows(db.from('consent_records').delete().eq('openid', openid))

  const deletedAt = nowValue()
  await updateRows(
    db
      .from('users')
      .update({
        openid: `deleted:${randomUUID()}`,
        nickname: null,
        avatar_url: null,
        status: 'DELETED',
        updated_at: deletedAt,
      })
      .eq('id', user.id),
    'Failed to anonymize account',
  )
  return { status: 'DELETED', deletedAt: deletedAt.replace(' ', 'T') + 'Z' }
}

async function listCategories() {
  const rows = await selectRows(
    db.from('device_categories').select('*').eq('scope', 'SYSTEM').eq('is_active', 1),
    'Failed to read categories',
  )
  return rows
    .filter((row) => row && typeof row.id === 'string' && typeof row.code === 'string')
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      sortOrder: Number(row.sort_order || 0),
    }))
}

function normalizeDevicePayload(payload) {
  const name = text(payload.name, 64, 'name', true)
  const status = text(payload.status, 16, 'status', true)
  if (!DEVICE_STATUSES.includes(status)) fail('VALIDATION_ERROR', 'status is invalid')
  const purchaseDate = optionalDate(payload.purchaseDate, 'purchaseDate')
  if (purchaseDate && purchaseDate > todayString()) {
    fail('VALIDATION_ERROR', 'purchaseDate is in the future')
  }
  return {
    category_id: text(payload.categoryId, 36, 'categoryId', true),
    name,
    status,
    brand: text(payload.brand, 64, 'brand'),
    model: text(payload.model, 128, 'model'),
    serial_number: text(payload.serialNumber, 128, 'serialNumber'),
    purchase_date: purchaseDate,
    purchase_channel: text(payload.purchaseChannel, 128, 'purchaseChannel'),
    purchase_price_cents: optionalNonNegativeInt(payload.purchasePriceCents, 'purchasePriceCents'),
    notes: text(payload.notes, 1000, 'notes'),
    updated_at: nowValue(),
  }
}

async function saveDevice(openid, payload) {
  const user = await findUser(openid)
  if (!user || user.status !== 'ACTIVE') fail('UNAUTHORIZED')

  const deviceFields = normalizeDevicePayload(payload)
  const categories = await selectRows(
    db.from('device_categories').select('*').eq('id', deviceFields.category_id).limit(1),
    'Failed to read category',
  )
  const category = categories[0]
  if (!category || Number(category.is_active) !== 1) fail('CATEGORY_NOT_FOUND')

  const mode = text(payload.warranty && payload.warranty.mode, 8, 'warranty.mode', true)
  if (!['KEEP', 'SET', 'CLEAR'].includes(mode)) fail('VALIDATION_ERROR', 'warranty.mode is invalid')
  const warrantyStart = optionalDate(
    payload.warranty && payload.warranty.startDate,
    'warranty.startDate',
  )
  const warrantyEnd = optionalDate(payload.warranty && payload.warranty.endDate, 'warranty.endDate')
  const warrantyProvider = text(
    payload.warranty && payload.warranty.provider,
    128,
    'warranty.provider',
  )
  if (mode === 'SET' && (!warrantyStart || !warrantyEnd || warrantyEnd < warrantyStart)) {
    fail('VALIDATION_ERROR', 'warranty dates are invalid')
  }

  const requestedId = text(payload.deviceId, 36, 'deviceId')
  let created = false
  let previous = null
  let id = requestedId

  if (!id) {
    created = true
    id = randomUUID()
    await insertRow(
      'devices',
      { id, openid, currency: 'CNY', ...deviceFields, created_at: nowValue() },
      'Failed to create device',
    )
  } else {
    previous = await getOwnedDevice(openid, id)
    if (mode !== 'KEEP' || previous.status !== deviceFields.status)
      await phase11.cancelReminders(openid, id)
    if (['IN_USE', 'IDLE'].includes(deviceFields.status)) {
      Object.assign(deviceFields, {
        disposal_date: null,
        disposal_price_cents: null,
        disposal_notes: null,
      })
    }
    await updateRows(
      db.from('devices').update(deviceFields).eq('id', id).eq('openid', openid),
      'Failed to update device',
    )
  }

  try {
    if (mode === 'CLEAR' || (created && mode === 'KEEP')) {
      await deleteRows(db.from('warranties').delete().eq('device_id', id).eq('openid', openid))
    } else if (mode === 'SET') {
      await deleteRows(db.from('warranties').delete().eq('device_id', id).eq('openid', openid))
      await insertRow('warranties', {
        id: randomUUID(),
        device_id: id,
        openid,
        start_date: warrantyStart,
        end_date: warrantyEnd,
        provider: warrantyProvider,
        created_at: nowValue(),
        updated_at: nowValue(),
      })
    }

    await appendTimeline(
      openid,
      id,
      created ? 'CREATED' : 'UPDATED',
      todayString(),
      deviceFields.name,
      created ? 'Device created' : 'Device updated',
      { changedFields: ['device'] },
    )
  } catch (error) {
    if (created) {
      await deleteRows(db.from('devices').delete().eq('id', id).eq('openid', openid)).catch(
        () => undefined,
      )
    } else if (previous) {
      await updateRows(
        db
          .from('devices')
          .update({
            category_id: previous.category_id,
            name: previous.name,
            status: previous.status,
            brand: previous.brand,
            model: previous.model,
            serial_number: previous.serial_number,
            purchase_date: previous.purchase_date,
            purchase_channel: previous.purchase_channel,
            purchase_price_cents: previous.purchase_price_cents,
            currency: previous.currency,
            notes: previous.notes,
            deleted_at: previous.deleted_at,
            disposal_date: previous.disposal_date || null,
            disposal_price_cents: previous.disposal_price_cents ?? null,
            disposal_notes: previous.disposal_notes || null,
          })
          .eq('id', id)
          .eq('openid', openid),
      ).catch(() => undefined)
    }
    throw error
  }

  return { id, created }
}

async function listDevices(openid, payload) {
  const rows = await selectRows(db.from('devices').select('*').eq('openid', openid).limit(500))
  const keyword = text(payload.keyword, 128, 'keyword')
  const categoryId = text(payload.categoryId, 36, 'categoryId')
  const status = text(payload.status, 16, 'status')
  const sortBy = payload.sortBy || 'createdAt'
  const sortOrder = payload.sortOrder === 'asc' ? 1 : -1
  const page = Number.isInteger(payload.page) && payload.page > 0 ? payload.page : 1
  const pageSize =
    Number.isInteger(payload.pageSize) && payload.pageSize > 0
      ? Math.min(payload.pageSize, 100)
      : 20

  let items = rows.filter((row) => !isDeleted(row))
  if (keyword) {
    const needle = keyword.toLowerCase()
    items = items.filter((row) =>
      [row.name, row.brand, row.model]
        .filter((value) => typeof value === 'string')
        .some((value) => value.toLowerCase().includes(needle)),
    )
  }
  if (categoryId) items = items.filter((row) => row.category_id === categoryId)
  if (status) items = items.filter((row) => row.status === status)

  const sortKeys = {
    createdAt: 'created_at',
    purchaseDate: 'purchase_date',
    name: 'name',
    price: 'purchase_price_cents',
  }
  const sortKey = sortKeys[sortBy] || 'created_at'
  items.sort((a, b) => {
    const left = a[sortKey] || ''
    const right = b[sortKey] || ''
    if (left === right) return String(a.id).localeCompare(String(b.id)) * sortOrder
    return String(left).localeCompare(String(right)) * sortOrder
  })

  const total = items.length
  const from = (page - 1) * pageSize
  return {
    items: items.slice(from, from + pageSize).map(mapDevice),
    total,
    hasMore: from + pageSize < total,
  }
}

async function getDevice(openid, payload) {
  return mapDevice(await getOwnedDevice(openid, payload.id))
}

async function softDeleteDevice(openid, payload) {
  await getOwnedDevice(openid, payload.id)
  await phase11.cancelReminders(openid, payload.id)
  await phase11.cleanupAttachments(openid, payload.id)
  const deletedAt = nowValue()
  await updateRows(
    db.from('devices').update({ deleted_at: deletedAt }).eq('id', payload.id).eq('openid', openid),
  )
  return { deletedAt: deletedAt.replace(' ', 'T') + 'Z' }
}

async function getWarranty(openid, payload) {
  const rows = await selectRows(
    db
      .from('warranties')
      .select('*')
      .eq('device_id', payload.deviceId)
      .eq('openid', openid)
      .limit(1),
  )
  return rows[0] ? mapWarranty(rows[0]) : null
}

async function listWarranties(openid, payload) {
  const limit = Number.isInteger(payload.limit) ? Math.min(Math.max(payload.limit, 1), 500) : 100
  const rows = await selectRows(db.from('warranties').select('*').eq('openid', openid).limit(500))
  return rows
    .sort((a, b) => String(a.end_date).localeCompare(String(b.end_date)))
    .slice(0, limit)
    .map(mapWarranty)
}

async function listMaintenance(openid, payload) {
  const deviceId = text(payload.deviceId, 36, 'deviceId')
  if (deviceId) await getOwnedDevice(openid, deviceId)
  let rows = await selectRows(
    db.from('maintenance_records').select('*').eq('openid', openid).limit(1000),
  )
  if (deviceId) rows = rows.filter((row) => row.device_id === deviceId)
  rows.sort((a, b) => {
    const left = `${a.occurred_at}|${a.created_at}|${a.id}`
    const right = `${b.occurred_at}|${b.created_at}|${b.id}`
    return right.localeCompare(left)
  })
  const page = Number.isInteger(payload.page) && payload.page > 0 ? payload.page : 1
  const pageSize = Number.isInteger(payload.pageSize)
    ? Math.min(Math.max(payload.pageSize, 1), 50)
    : 50
  const from = (page - 1) * pageSize
  return {
    items: rows.slice(from, from + pageSize).map(mapMaintenance),
    page,
    pageSize,
    total: rows.length,
    hasMore: from + pageSize < rows.length,
  }
}

async function getMaintenance(openid, payload) {
  const rows = await selectRows(
    db
      .from('maintenance_records')
      .select('*')
      .eq('id', payload.id)
      .eq('device_id', payload.deviceId)
      .eq('openid', openid)
      .limit(1),
  )
  return rows[0] ? mapMaintenance(rows[0]) : null
}

async function listRecentMaintenance(openid, payload) {
  const limit = Number.isInteger(payload.limit) ? Math.min(Math.max(payload.limit, 1), 50) : 5
  const [rows, devices] = await Promise.all([
    selectRows(db.from('maintenance_records').select('*').eq('openid', openid).limit(1000)),
    selectRows(db.from('devices').select('*').eq('openid', openid).limit(1000)),
  ])
  const liveDevices = new Set(devices.filter((row) => !isDeleted(row)).map((row) => row.id))
  rows.sort((a, b) => {
    const left = `${a.occurred_at}|${a.created_at}|${a.id}`
    const right = `${b.occurred_at}|${b.created_at}|${b.id}`
    return right.localeCompare(left)
  })
  return rows
    .filter((row) => liveDevices.has(row.device_id))
    .slice(0, limit)
    .map(mapMaintenance)
}

function normalizeMaintenancePayload(payload, purchaseDate) {
  const title = text(payload.title, 64, 'title', true)
  const type = text(payload.type, 16, 'type', true)
  if (!MAINTENANCE_TYPES.includes(type)) fail('VALIDATION_ERROR', 'type is invalid')
  const occurredAt = requiredDate(payload.occurredAt, 'occurredAt')
  if (occurredAt > todayString()) fail('DATE_RANGE_INVALID')
  if (purchaseDate && occurredAt < purchaseDate) fail('DATE_RANGE_INVALID')
  return {
    title,
    type,
    occurred_at: occurredAt,
    cost_cents: optionalNonNegativeInt(payload.costCents, 'costCents'),
    vendor: text(payload.vendor, 128, 'vendor'),
    notes: text(payload.notes, 1000, 'notes'),
    updated_at: nowValue(),
  }
}

async function syncMaintenanceCost(openid, record) {
  await deleteRows(
    db.from('device_costs').delete().eq('maintenance_id', record.id).eq('openid', openid),
  )
  if (record.cost_cents !== null && record.cost_cents !== undefined) {
    await insertRow('device_costs', {
      id: randomUUID(),
      device_id: record.device_id,
      openid,
      cost_type: 'MAINTENANCE',
      amount_cents: record.cost_cents,
      occurred_at: record.occurred_at,
      maintenance_id: record.id,
      created_at: nowValue(),
    })
  }
}

async function addMaintenance(openid, payload) {
  const device = await getOwnedDevice(openid, payload.deviceId)
  const fields = normalizeMaintenancePayload(payload, device.purchase_date)
  const id = randomUUID()
  const record = { id, device_id: device.id, openid, ...fields, created_at: nowValue() }
  await insertRow('maintenance_records', record)
  try {
    await syncMaintenanceCost(openid, record)
    await appendTimeline(
      openid,
      device.id,
      'MAINTENANCE',
      fields.occurred_at,
      fields.title,
      'Maintenance record added',
      { changedFields: ['maintenance'] },
    )
  } catch (error) {
    await deleteRows(
      db.from('device_costs').delete().eq('maintenance_id', id).eq('openid', openid),
    ).catch(() => undefined)
    await deleteRows(
      db.from('maintenance_records').delete().eq('id', id).eq('openid', openid),
    ).catch(() => undefined)
    throw error
  }
  return { id }
}

async function updateMaintenance(openid, payload) {
  const rows = await selectRows(
    db.from('maintenance_records').select('*').eq('id', payload.id).eq('openid', openid).limit(1),
  )
  const previous = rows[0]
  if (!previous) fail('RESOURCE_NOT_FOUND')
  const device = await getOwnedDevice(openid, previous.device_id)
  const fields = normalizeMaintenancePayload(payload, device.purchase_date)
  await updateRows(
    db.from('maintenance_records').update(fields).eq('id', payload.id).eq('openid', openid),
    'Failed to update maintenance',
  )
  try {
    await syncMaintenanceCost(openid, { ...previous, ...fields, id: payload.id })
  } catch (error) {
    await updateRows(
      db
        .from('maintenance_records')
        .update({
          title: previous.title,
          type: previous.type,
          occurred_at: previous.occurred_at,
          cost_cents: previous.cost_cents,
          vendor: previous.vendor,
          notes: previous.notes,
        })
        .eq('id', payload.id)
        .eq('openid', openid),
    ).catch(() => undefined)
    throw error
  }
  return { ok: true }
}

async function deleteMaintenance(openid, payload) {
  const rows = await selectRows(
    db.from('maintenance_records').select('*').eq('id', payload.id).eq('openid', openid).limit(1),
  )
  if (!rows[0]) fail('RESOURCE_NOT_FOUND')
  await deleteRows(
    db.from('device_costs').delete().eq('maintenance_id', payload.id).eq('openid', openid),
  )
  await deleteRows(
    db.from('maintenance_records').delete().eq('id', payload.id).eq('openid', openid),
  )
  return { ok: true }
}

async function listTimeline(openid, payload) {
  const deviceId = text(payload.deviceId, 36, 'deviceId')
  await getOwnedDevice(openid, deviceId)
  let rows = await selectRows(
    db.from('device_timelines').select('*').eq('openid', openid).limit(1000),
  )
  rows = rows.filter((row) => row.device_id === deviceId)
  if (payload.eventType) rows = rows.filter((row) => row.event_type === payload.eventType)
  rows.sort((a, b) => {
    const left = `${a.event_date}|${a.created_at}|${a.id}`
    const right = `${b.event_date}|${b.created_at}|${b.id}`
    return right.localeCompare(left)
  })
  const page = Number.isInteger(payload.page) && payload.page > 0 ? payload.page : 1
  const pageSize = Number.isInteger(payload.pageSize)
    ? Math.min(Math.max(payload.pageSize, 1), 50)
    : 20
  const from = (page - 1) * pageSize
  return {
    items: rows.slice(from, from + pageSize).map(mapTimeline),
    page,
    pageSize,
    total: rows.length,
    hasMore: from + pageSize < rows.length,
  }
}

function daysBetween(start, end) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000)
}

function warrantySummary(devices, warranties, today) {
  const warrantyByDevice = new Map(warranties.map((row) => [row.device_id, row]))
  const summary = { inWarranty: 0, expiringIn30Days: 0, expired: 0, unknown: 0 }
  for (const device of devices) {
    const warranty = warrantyByDevice.get(device.id)
    if (!warranty) {
      summary.unknown += 1
      continue
    }
    const remaining = daysBetween(today, warranty.end_date)
    if (remaining < 0) summary.expired += 1
    else if (remaining <= 30) summary.expiringIn30Days += 1
    else summary.inWarranty += 1
  }
  return summary
}

async function loadOwnerData(openid) {
  const [devices, warranties, maintenances, costs, categories] = await Promise.all([
    selectRows(db.from('devices').select('*').eq('openid', openid).limit(1000)),
    selectRows(db.from('warranties').select('*').eq('openid', openid).limit(1000)),
    selectRows(db.from('maintenance_records').select('*').eq('openid', openid).limit(1000)),
    selectRows(db.from('device_costs').select('*').eq('openid', openid).limit(1000)),
    selectRows(db.from('device_categories').select('*')),
  ])
  return {
    devices: devices.filter((row) => !isDeleted(row)),
    warranties,
    maintenances,
    costs,
    categories,
  }
}

function statistics(payload, ownerData) {
  const startDate = requiredDate(payload.startDate, 'startDate')
  const endDate = requiredDate(payload.endDate, 'endDate')
  if (startDate > endDate) fail('DATE_RANGE_INVALID')
  const categoryId = payload.categoryId || null
  const today = todayString()
  const devices = ownerData.devices.filter((row) => !categoryId || row.category_id === categoryId)
  const deviceIds = new Set(devices.map((row) => row.id))
  const warranties = ownerData.warranties.filter((row) => deviceIds.has(row.device_id))
  const costs = ownerData.costs.filter((row) => deviceIds.has(row.device_id))

  const currencyValues = [...new Set(devices.map((row) => row.currency || 'CNY'))]
  const categories = new Map(ownerData.categories.map((row) => [row.id, row.name]))
  const categoryMap = new Map()
  for (const row of devices) {
    const key = row.category_id || 'uncategorized'
    const item = categoryMap.get(key) || {
      categoryId: row.category_id || null,
      categoryName: categories.get(row.category_id) || '未分类',
      deviceCount: 0,
      assetCents: 0,
    }
    item.deviceCount += 1
    item.assetCents += Number(row.purchase_price_cents || 0)
    categoryMap.set(key, item)
  }

  const statusLabels = {
    IN_USE: '使用中',
    IDLE: '闲置',
    SOLD: '已出售',
    DISCARDED: '已报废',
  }
  return {
    deviceCount: devices.length,
    activeDeviceCount: devices.filter((row) => ['IN_USE', 'IDLE'].includes(row.status)).length,
    totalAssetCents: devices.reduce((sum, row) => sum + Number(row.purchase_price_cents || 0), 0),
    purchaseSpendCents: devices
      .filter(
        (row) =>
          row.purchase_date && row.purchase_date >= startDate && row.purchase_date <= endDate,
      )
      .reduce((sum, row) => sum + Number(row.purchase_price_cents || 0), 0),
    maintenanceSpendCents: costs
      .filter(
        (row) =>
          row.cost_type === 'MAINTENANCE' &&
          row.occurred_at >= startDate &&
          row.occurred_at <= endDate,
      )
      .reduce((sum, row) => sum + Number(row.amount_cents || 0), 0),
    currency: currencyValues.length > 1 ? 'MIXED' : currencyValues[0] || 'CNY',
    warrantySummary: warrantySummary(devices, warranties, today),
    categoryDistribution: [...categoryMap.values()].sort(
      (a, b) => b.assetCents - a.assetCents || a.categoryName.localeCompare(b.categoryName),
    ),
    lifecycleDistribution: Object.entries(statusLabels).map(([status, label]) => ({
      status,
      label,
      deviceCount: devices.filter((row) => row.status === status).length,
      assetCents: devices
        .filter((row) => row.status === status)
        .reduce((sum, row) => sum + Number(row.purchase_price_cents || 0), 0),
    })),
  }
}

function dashboard(ownerData) {
  const today = todayString()
  const warrantyByDevice = new Map(ownerData.warranties.map((row) => [row.device_id, row]))
  const deviceById = new Map(ownerData.devices.map((row) => [row.id, row]))
  const items = ownerData.devices
    .map((device) => {
      const warranty = warrantyByDevice.get(device.id)
      if (!warranty) return null
      return {
        deviceId: device.id,
        deviceName: device.name,
        endDate: warranty.end_date,
        remainingDays: daysBetween(today, warranty.end_date),
      }
    })
    .filter(Boolean)
  const expiring = items
    .filter((item) => item.remainingDays >= 0 && item.remainingDays <= 30)
    .sort((a, b) => a.remainingDays - b.remainingDays)
  const expired = items
    .filter((item) => item.remainingDays < 0 && item.remainingDays >= -90)
    .sort((a, b) => b.remainingDays - a.remainingDays)
  const recentMaintenances = ownerData.maintenances
    .slice()
    .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)))
    .filter((row) => deviceById.has(row.device_id))
    .slice(0, 5)
    .map((row) => {
      const device = deviceById.get(row.device_id)
      return {
        id: row.id,
        deviceId: row.device_id,
        deviceName: device ? device.name : '未知设备',
        title: row.title,
        occurredAt: row.occurred_at,
        costCents: row.cost_cents === null ? null : Number(row.cost_cents),
        currency: device ? device.currency || 'CNY' : 'CNY',
      }
    })
  return {
    deviceCount: ownerData.devices.length,
    activeDeviceCount: ownerData.devices.filter((row) => ['IN_USE', 'IDLE'].includes(row.status))
      .length,
    warrantySummary: warrantySummary(ownerData.devices, ownerData.warranties, today),
    expiringTotal: expiring.length,
    expiredTotal: expired.length,
    expiring: expiring.slice(0, 30),
    expired: expired.slice(0, 30),
    recentMaintenances,
  }
}

async function health() {
  await selectRows(db.from('device_categories').select('id').limit(1), 'MySQL health check failed')
  return { ok: true }
}

async function route(openid, action, payload) {
  switch (action) {
    case 'health':
      return health()
    case 'auth.bootstrap':
      return bootstrapUser(openid, payload)
    case 'auth.current': {
      const user = await findUser(openid)
      return user ? { user: mapUser(user) } : { user: null }
    }
    case 'auth.updateProfile':
      return updateProfile(openid, payload)
    case 'auth.deleteAccount':
      return deleteAccount(openid)
    case 'category.list':
      return { items: await listCategories() }
    case 'device.save':
      return saveDevice(openid, payload)
    case 'device.list':
      return listDevices(openid, payload)
    case 'device.get':
      return { item: await getDevice(openid, payload) }
    case 'device.softDelete':
      return softDeleteDevice(openid, payload)
    case 'warranty.get':
      return { item: await getWarranty(openid, payload) }
    case 'warranty.list':
      return { items: await listWarranties(openid, payload) }
    case 'maintenance.page':
      return listMaintenance(openid, payload)
    case 'maintenance.get':
      return { item: await getMaintenance(openid, payload) }
    case 'maintenance.recent':
      return { items: await listRecentMaintenance(openid, payload) }
    case 'maintenance.add':
      return addMaintenance(openid, payload)
    case 'maintenance.update':
      return updateMaintenance(openid, payload)
    case 'maintenance.delete':
      return deleteMaintenance(openid, payload)
    case 'timeline.list':
      return listTimeline(openid, payload)
    case 'stats.overview':
      return statistics(payload, await loadOwnerData(openid))
    case 'dashboard.get':
      return dashboard(await loadOwnerData(openid))
    default:
      return phase11.route(openid, action, payload)
  }
}

const phase11 = createPhase11({
  db,
  cloud,
  storage: app,
  fail,
  selectRows,
  insertRow,
  updateRows,
  deleteRows,
  getOwnedDevice,
  findUser,
  appendTimeline,
  todayString,
  nowValue,
  text,
  mapDevice,
  mapWarranty,
  mapMaintenance,
})

exports.main = async (event) => {
  const action = event && typeof event.action === 'string' ? event.action : ''
  const payload = event && event.payload && typeof event.payload === 'object' ? event.payload : {}
  const wxContext = cloud.getWXContext()
  const openid = wxContext && typeof wxContext.OPENID === 'string' ? wxContext.OPENID : ''
  if (isTimerInvocation(event, wxContext, process.env.GEARFLOW_TIMER_TOKEN)) {
    try {
      return { ok: true, data: await phase11.sendDue() }
    } catch {
      console.error('gearflow-api scheduler: INTERNAL_ERROR')
      return { ok: false, errorCode: 'INTERNAL_ERROR' }
    }
  }
  if (!openid && action !== 'health') return { ok: false, errorCode: 'UNAUTHORIZED' }

  try {
    return { ok: true, data: await route(openid, action, payload) }
  } catch (error) {
    if (error instanceof ApiFailure) {
      return { ok: false, errorCode: error.code, message: error.message }
    }
    console.error('gearflow-api failed: INTERNAL_ERROR')
    return { ok: false, errorCode: 'INTERNAL_ERROR' }
  }
}
