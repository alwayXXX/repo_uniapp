import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

const source = readFileSync(
  new URL('../cloudfunctions/gearflow-api/index.js', import.meta.url),
  'utf8',
)
const privateTables = [
  'device_attachments',
  'device_reminders',
  'devices',
  'warranties',
  'maintenance_records',
  'device_costs',
  'device_timelines',
  'consent_records',
]

function fixture() {
  const data = { users: [], device_categories: [] }
  for (const table of privateTables) data[table] = []
  for (const owner of ['alpha', 'beta']) {
    data.users.push({ id: `user-${owner}`, openid: owner, nickname: owner, status: 'ACTIVE' })
    data.devices.push({
      id: `device-${owner}`,
      openid: owner,
      name: `Device ${owner}`,
      status: 'IN_USE',
      purchase_date: '2026-01-01',
      purchase_price_cents: 10000,
      currency: 'CNY',
      deleted_at: null,
    })
    for (const table of privateTables.filter((name) => name !== 'devices')) {
      data[table].push({
        id: `${table}-${owner}`,
        device_id: `device-${owner}`,
        openid: owner,
        title: 'Synthetic record',
        type: 'CLEAN',
        end_date: '2026-12-31',
        occurred_at: '2026-01-02',
        cost_type: 'MAINTENANCE',
        amount_cents: 200,
      })
    }
  }
  data.device_categories.push({ id: 'system-category', scope: 'SYSTEM', is_active: 1 })
  return data
}

// Exercise the deployed entry point against an in-memory query adapter. Neither
// SDK is loaded, so these tests cannot connect to or delete real CloudBase data.
function harness(initial = fixture(), initialOwner = 'alpha') {
  const tables = structuredClone(initial)
  const writes = []
  const failures = []
  let owner = initialOwner
  let trustedSource = 'wx_devtools'
  const cloudFiles = new Map()
  const sentMessages = []
  let storageFailure = false
  let ambiguousUpload = false
  let templateAvailable = true
  let customTemplates = null

  class Query {
    constructor(table) {
      this.table = table
      this.filters = []
      this.operation = 'select'
      this.maximum = Infinity
    }
    select() {
      if (this.operation !== 'select') this.returning = true
      return this
    }
    order() {
      return this
    }
    range(from, to) {
      this.offset = from
      this.maximum = to - from + 1
      return this
    }
    eq(field, value) {
      this.filters.push([field, value])
      return this
    }
    limit(maximum) {
      this.maximum = maximum
      return this
    }
    insert(row) {
      this.operation = 'insert'
      this.row = structuredClone(row)
      return this
    }
    update(row) {
      this.operation = 'update'
      this.row = structuredClone(row)
      return this
    }
    delete() {
      this.operation = 'delete'
      return this
    }
    then(resolve, reject) {
      return Promise.resolve()
        .then(() => this.execute())
        .then(resolve, reject)
    }
    execute() {
      const failureIndex = failures.findIndex(
        (entry) => entry.table === this.table && entry.operation === this.operation,
      )
      if (failureIndex >= 0) {
        failures.splice(failureIndex, 1)
        return { error: { code: 'SIMULATED_FAILURE' } }
      }
      const matches = (row) => this.filters.every(([field, value]) => row[field] === value)
      const selected = tables[this.table]
        .filter(matches)
        .slice(this.offset || 0, (this.offset || 0) + this.maximum)
      if (this.operation === 'select') return { data: structuredClone(selected) }
      writes.push({ table: this.table, operation: this.operation })
      if (this.operation === 'insert') tables[this.table].push(this.row)
      if (this.operation === 'update') selected.forEach((row) => Object.assign(row, this.row))
      if (this.operation === 'delete')
        tables[this.table] = tables[this.table].filter((row) => !matches(row))
      return { data: this.returning ? structuredClone(selected) : [] }
    }
  }

  const module = { exports: {} }
  runInNewContext(source, {
    exports: module.exports,
    require(name) {
      if (name === './phase11')
        return createRequire(import.meta.url)('../cloudfunctions/gearflow-api/phase11.js')
      if (name === 'node:crypto') return { randomUUID }
      if (name === '@cloudbase/node-sdk')
        return {
          init: () => ({
            rdb: () => ({ from: (table) => new Query(table) }),
            async getUploadMetadata({ cloudPath }) {
              return { fileID: `cloud://test/${cloudPath}` }
            },
            async uploadFile({ cloudPath, fileContent }) {
              const fileID = `cloud://test/${cloudPath}`
              cloudFiles.set(fileID, fileContent)
              if (ambiguousUpload) throw new Error('SIMULATED_UPLOAD_RESPONSE_LOSS')
              return { fileID }
            },
            async deleteFile({ fileList }) {
              if (storageFailure) throw new Error('SIMULATED_STORAGE_FAILURE')
              fileList.forEach((id) => cloudFiles.delete(id))
              return { fileList: fileList.map((fileID) => ({ fileID, code: 'SUCCESS' })) }
            },
            async getTempFileURL() {
              return {
                fileList: [{ tempFileURL: 'https://example.test/private', code: 'SUCCESS' }],
              }
            },
            async downloadFile({ fileID }) {
              return { fileContent: cloudFiles.get(fileID) }
            },
          }),
        }
      if (name === 'wx-server-sdk')
        return {
          init() {},
          getWXContext: () => ({ OPENID: owner, SOURCE: trustedSource }),
          openapi: {
            subscribeMessage: {
              async getTemplateList() {
                return {
                  data:
                    customTemplates ||
                    (templateAvailable
                      ? [
                          {
                            priTmplId: 'test-template',
                            type: 2,
                            title: '保修到期提醒',
                            content: '设备名称{{thing1.DATA}}\n到期日期{{date2.DATA}}',
                          },
                        ]
                      : []),
                }
              },
              async send(message) {
                sentMessages.push(message)
                return { errCode: 0 }
              },
            },
          },
        }
      throw new Error(`Unexpected dependency: ${name}`)
    },
    console: { error() {} },
    Date: class extends Date {
      constructor(...args) {
        if (args.length) super(...args)
        else super('2026-10-27T01:00:00Z')
      }
      static now() {
        return Date.parse('2026-10-27T01:00:00Z')
      }
    },
  })
  return {
    tables,
    writes,
    cloudFiles,
    uploadResponseLost(value) {
      ambiguousUpload = value
    },
    sentMessages,
    storageFails(value) {
      storageFailure = value
    },
    templatesAvailable(value) {
      templateAvailable = value
    },
    templates(value) {
      customTemplates = value
    },
    source(value) {
      trustedSource = value
    },
    as(nextOwner) {
      owner = nextOwner
    },
    failOnce(table, operation) {
      failures.push({ table, operation })
    },
    async call(action, payload = {}, event = {}) {
      return structuredClone(await module.exports.main({ ...event, action, payload }))
    },
  }
}

test('rejects missing trusted identity even when event or payload forges an owner', async () => {
  const api = harness(fixture(), '')
  for (const action of [
    'auth.current',
    'auth.bootstrap',
    'auth.deleteAccount',
    'device.list',
    'device.save',
    'stats.overview',
    'maintenance.delete',
  ]) {
    const result = await api.call(
      action,
      { openid: 'beta', userId: 'user-beta' },
      { OPENID: 'beta' },
    )
    assert.deepEqual(result, { ok: false, errorCode: 'UNAUTHORIZED' })
  }
  assert.equal(api.writes.length, 0)
})

test('lists only the trusted owner and excludes soft-deleted devices', async () => {
  const api = harness()
  api.tables.devices.push({
    ...api.tables.devices[0],
    id: 'deleted-device',
    deleted_at: '2026-01-03',
  })
  const result = await api.call('device.list', { openid: 'beta', userId: 'user-beta' })
  assert.equal(result.ok, true)
  assert.deepEqual(
    result.data.items.map((row) => row.id),
    ['device-alpha'],
  )
  assert.equal(result.data.total, 1)
})

test('blocks cross-owner device reads and deletion without modifying data', async () => {
  const api = harness()
  for (const action of ['device.get', 'device.softDelete']) {
    const result = await api.call(action, { id: 'device-beta', openid: 'beta' })
    assert.equal(result.errorCode, 'DEVICE_NOT_FOUND')
  }
  assert.equal(api.writes.length, 0)
  assert.equal(api.tables.devices[1].deleted_at, null)
})

test('isolates warranty, maintenance and timeline reads', async () => {
  const api = harness()
  const warranty = await api.call('warranty.get', { deviceId: 'device-beta' })
  assert.equal(warranty.data.item, null)
  const maintenance = await api.call('maintenance.get', {
    id: 'maintenance_records-beta',
    deviceId: 'device-beta',
  })
  assert.equal(maintenance.data.item, null)
  const list = await api.call('maintenance.page')
  assert.deepEqual(
    list.data.items.map((row) => row.id),
    ['maintenance_records-alpha'],
  )
  const timeline = await api.call('timeline.list', { deviceId: 'device-beta' })
  assert.equal(timeline.errorCode, 'DEVICE_NOT_FOUND')
})

test('rejects cross-owner maintenance updates and deletion', async () => {
  const api = harness()
  for (const action of ['maintenance.update', 'maintenance.delete']) {
    const result = await api.call(action, {
      id: 'maintenance_records-beta',
      deviceId: 'device-beta',
    })
    assert.equal(result.errorCode, 'RESOURCE_NOT_FOUND')
  }
  assert.equal(api.writes.length, 0)
})

test('statistics and dashboard include only live devices belonging to the caller', async () => {
  const api = harness()
  api.tables.devices.push({
    ...api.tables.devices[0],
    id: 'deleted-device',
    deleted_at: '2026-01-03',
    purchase_price_cents: 90000,
  })
  const result = await api.call('stats.overview', {
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    openid: 'beta',
  })
  assert.equal(result.ok, true)
  assert.equal(result.data.deviceCount, 1)
  assert.equal(result.data.totalAssetCents, 10000)
  assert.equal(result.data.purchaseSpendCents, 10000)
  assert.equal(result.data.maintenanceSpendCents, 200)
  const dashboard = await api.call('dashboard.get')
  assert.equal(dashboard.data.deviceCount, 1)
  assert.deepEqual(
    dashboard.data.recentMaintenances.map((row) => row.deviceId),
    ['device-alpha'],
  )
})

test('restoring a user does not write consent or expose the trusted identity', async () => {
  const api = harness()
  const result = await api.call('auth.current')
  assert.equal(result.data.user.id, 'user-alpha')
  assert.equal(Object.hasOwn(result.data.user, 'openid'), false)
  assert.equal(api.writes.length, 0)
})

test('explicit consent uses trusted identity and is idempotent for a policy version', async () => {
  const api = harness({ ...fixture(), users: [], consent_records: [] })
  const payload = {
    privacyVersion: '1.0.1',
    termsVersion: '1.0.1',
    openid: 'beta',
    userId: 'user-beta',
  }
  assert.equal((await api.call('auth.bootstrap', payload)).ok, true)
  assert.equal((await api.call('auth.bootstrap', payload)).ok, true)
  assert.equal(api.tables.users.length, 1)
  assert.equal(api.tables.users[0].openid, 'alpha')
  assert.equal(api.tables.consent_records.length, 2)
  assert.ok(api.tables.consent_records.every((row) => row.openid === 'alpha'))
})

test('account deletion removes all private records including soft-deleted devices and preserves other owners', async () => {
  const api = harness()
  api.tables.devices.push({
    ...api.tables.devices[0],
    id: 'deleted-device',
    deleted_at: '2026-01-03',
  })
  const otherBefore = Object.fromEntries(
    Object.entries(api.tables).map(([table, rows]) => [
      table,
      structuredClone(rows.filter((row) => row.openid === 'beta')),
    ]),
  )
  const result = await api.call('auth.deleteAccount', { openid: 'beta', userId: 'user-beta' })
  assert.equal(result.ok, true)
  assert.equal(result.data.status, 'DELETED')
  for (const table of privateTables)
    assert.ok(
      api.tables[table].every((row) => row.openid !== 'alpha'),
      table,
    )
  for (const [table, before] of Object.entries(otherBefore))
    assert.deepEqual(
      api.tables[table].filter((row) => row.openid === 'beta'),
      before,
      table,
    )
  const deletedUser = api.tables.users.find((row) => row.id === 'user-alpha')
  assert.equal(deletedUser.status, 'DELETED')
  assert.match(deletedUser.openid, /^deleted:/)
  assert.equal(deletedUser.nickname, null)
  assert.equal(deletedUser.avatar_url, null)
  assert.equal(api.tables.device_categories.length, 1)
  assert.equal((await api.call('auth.current')).data.user, null)
  assert.equal((await api.call('auth.deleteAccount')).data.status, 'NOT_FOUND')
})

test('a database deletion failure is reported and can be retried without losing account ownership', async () => {
  const api = harness()
  api.failOnce('maintenance_records', 'delete')
  const failed = await api.call('auth.deleteAccount')
  assert.equal(failed.ok, false)
  assert.equal(failed.errorCode, 'INTERNAL_ERROR')
  assert.equal(api.tables.users[0].openid, 'alpha')
  assert.equal(api.tables.users[0].status, 'ACTIVE')
  assert.equal((await api.call('auth.deleteAccount')).data.status, 'DELETED')
  for (const table of privateTables)
    assert.ok(
      api.tables[table].every((row) => row.openid !== 'alpha'),
      table,
    )
})

function phase11Fixture() {
  const data = fixture()
  data.device_attachments = []
  data.device_reminders = []
  for (const owner of ['alpha', 'beta'])
    data.consent_records.push({
      id: `privacy-${owner}`,
      openid: owner,
      policy_type: 'PRIVACY',
      policy_version: '1.1.0',
    })
  return data
}

const pngContent = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]).toString('base64')
const uploadPayload = { deviceId: 'device-alpha', name: 'receipt.png', content: pngContent }

test('an upload response lost after cloud storage succeeds does not orphan the file', async () => {
  const api = harness(phase11Fixture())
  api.uploadResponseLost(true)
  assert.equal((await api.call('attachment.upload', uploadPayload)).ok, false)
  assert.equal(api.cloudFiles.size, 0)
  assert.equal(api.tables.device_attachments.length, 0)
})

test('failed upload compensation preserves a durable file reference for deletion retry', async () => {
  const api = harness(phase11Fixture())
  api.uploadResponseLost(true)
  api.storageFails(true)
  assert.equal((await api.call('attachment.upload', uploadPayload)).ok, false)
  assert.equal(api.tables.device_attachments[0].status, 'CLEANUP')
  assert.equal(typeof api.tables.device_attachments[0].file_id, 'string')
  api.storageFails(false)
  assert.equal((await api.call('auth.deleteAccount')).data.status, 'DELETED')
  assert.equal(api.cloudFiles.size, 0)
})

test('P11 requires the current explicit privacy consent', async () => {
  const api = harness()
  assert.equal((await api.call('export.json')).errorCode, 'FORBIDDEN')
  assert.equal(api.writes.length, 0)
})

test('annual report aggregates year and month boundaries and isolates another owner', async () => {
  const data = phase11Fixture()
  data.devices.push({
    ...data.devices[0],
    id: 'old-device',
    purchase_date: '2025-12-31',
    purchase_price_cents: 4000,
  })
  data.devices.push({
    ...data.devices[0],
    id: 'deleted-device',
    deleted_at: '2026-01-02',
    purchase_price_cents: 90000,
  })
  const api = harness(data)
  const result = await api.call('report.annual', { year: 2026, openid: 'beta' })
  assert.equal(result.ok, true)
  assert.equal(result.data.months.length, 12)
  assert.equal(result.data.purchaseCount, 1)
  assert.equal(result.data.purchaseCents, 10000)
  assert.equal(result.data.maintenanceCount, 1)
  assert.equal(result.data.totalSpendCents, 10000)
  assert.equal(result.data.months[0].purchaseCents, 10000)
  assert.equal(api.writes.length, 0)
})

test('annual report rejects invalid years and provides an empty historical report', async () => {
  const api = harness(phase11Fixture())
  for (const year of [2027, 1969, '2026', 2026.5])
    assert.equal((await api.call('report.annual', { year })).errorCode, 'VALIDATION_ERROR')
  assert.equal((await api.call('report.annual', { year: 2024 })).data.totalSpendCents, 0)
})

test('JSON export reads beyond the old 1000-row limit and strips identity and file references', async () => {
  const data = phase11Fixture()
  for (let i = 0; i < 1050; i++) data.devices.push({ ...data.devices[0], id: `bulk-${i}` })
  const result = await harness(data).call('export.json')
  assert.equal(result.ok, true)
  assert.equal(result.data.devices.length, 1051)
  for (const row of [
    ...result.data.devices,
    ...result.data.warranties,
    ...result.data.maintenances,
  ]) {
    assert.equal(Object.hasOwn(row, 'openid'), false)
    assert.equal(Object.hasOwn(row, 'userId'), false)
    assert.equal(Object.hasOwn(row, 'fileID'), false)
  }
})

test('device disposal validates dates, amount bounds and ownership before writing', async () => {
  const api = harness(phase11Fixture())
  const payload = {
    deviceId: 'device-alpha',
    status: 'SOLD',
    date: '2026-10-01',
    priceCents: 5000,
    notes: '',
  }
  for (const override of [
    { date: '2026-02-30' },
    { date: '2027-01-01' },
    { date: '2025-01-01' },
    { priceCents: -1 },
    { priceCents: 2147483648 },
    { status: 'IN_USE' },
  ]) {
    assert.equal(
      (await api.call('device.dispose', { ...payload, ...override })).errorCode,
      'VALIDATION_ERROR',
    )
  }
  assert.equal(
    (await api.call('device.dispose', { ...payload, deviceId: 'device-beta' })).errorCode,
    'DEVICE_NOT_FOUND',
  )
  assert.equal(api.writes.length, 0)
})

test('disposal records income without changing purchase cost and is idempotent on retry', async () => {
  const api = harness(phase11Fixture())
  const payload = {
    deviceId: 'device-alpha',
    status: 'SOLD',
    date: '2026-10-01',
    priceCents: 5000,
    notes: 'Synthetic note',
  }
  assert.equal((await api.call('device.dispose', payload)).ok, true)
  assert.equal((await api.call('device.dispose', payload)).ok, true)
  assert.equal(api.tables.device_timelines.filter((row) => row.event_type === 'SOLD').length, 1)
  assert.equal(api.tables.devices[0].purchase_price_cents, 10000)
  const report = await api.call('report.annual', { year: 2026 })
  assert.equal(report.data.disposalIncomeCents, 5000)
  assert.equal(report.data.netSpendCents, 5000)
  assert.ok(!JSON.stringify(api.tables.device_timelines.at(-1).payload).includes('5000'))
})

test('disposal restores device fields when timeline insertion fails', async () => {
  const api = harness(phase11Fixture())
  api.failOnce('device_timelines', 'insert')
  const result = await api.call('device.dispose', {
    deviceId: 'device-alpha',
    status: 'SOLD',
    date: '2026-10-01',
    priceCents: 200,
    notes: '',
  })
  assert.equal(result.ok, false)
  assert.equal(api.tables.devices[0].status, 'IN_USE')
  assert.equal(api.tables.devices[0].disposal_date, null)
})

test('attachment uploads validate content and names before cloud storage or metadata writes', async () => {
  const api = harness(phase11Fixture())
  for (const payload of [
    { ...uploadPayload, content: Buffer.from('not an image').toString('base64') },
    { ...uploadPayload, name: '../receipt.png' },
    { ...uploadPayload, name: 'receipt.pdf' },
    { ...uploadPayload, content: '!notbase64!' },
    { ...uploadPayload, content: Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64') },
  ])
    assert.equal((await api.call('attachment.upload', payload)).errorCode, 'VALIDATION_ERROR')
  assert.equal(
    (await api.call('attachment.upload', { ...uploadPayload, deviceId: 'device-beta' })).errorCode,
    'DEVICE_NOT_FOUND',
  )
  assert.equal(api.cloudFiles.size, 0)
  assert.equal(api.writes.length, 0)
})

test('attachment metadata exposes no cloud path and other owners cannot open or delete files', async () => {
  const api = harness(phase11Fixture())
  const upload = await api.call('attachment.upload', uploadPayload)
  assert.equal(upload.ok, true)
  assert.equal(Object.hasOwn(upload.data.item, 'file_id'), false)
  assert.equal(Object.hasOwn(upload.data.item, 'cloud_path'), false)
  const id = upload.data.item.id
  assert.equal((await api.call('attachment.open', { id })).ok, true)
  api.as('beta')
  for (const action of ['attachment.open', 'attachment.delete'])
    assert.equal((await api.call(action, { id })).errorCode, 'RESOURCE_NOT_FOUND')
  assert.equal(api.cloudFiles.size, 1)
})

test('cloud cleanup failures preserve metadata and prevent false account-deletion success', async () => {
  const api = harness(phase11Fixture())
  await api.call('attachment.upload', uploadPayload)
  api.storageFails(true)
  assert.equal((await api.call('auth.deleteAccount')).ok, false)
  assert.equal(api.tables.device_attachments.length, 1)
  assert.equal(api.tables.users[0].openid, 'alpha')
  api.storageFails(false)
  assert.equal((await api.call('auth.deleteAccount')).data.status, 'DELETED')
  assert.equal(api.cloudFiles.size, 0)
  assert.equal(api.tables.device_attachments.length, 0)
})

test('soft deletion cleans attachments before hiding the device', async () => {
  const api = harness(phase11Fixture())
  await api.call('attachment.upload', uploadPayload)
  assert.equal((await api.call('device.softDelete', { id: 'device-alpha' })).ok, true)
  assert.equal(api.cloudFiles.size, 0)
  assert.equal(api.tables.device_attachments.length, 0)
})

test('an unavailable subscription template is an explicit configuration state', async () => {
  const api = harness(phase11Fixture())
  api.templatesAvailable(false)
  assert.deepEqual((await api.call('reminder.config')).data, {
    available: false,
    templateId: null,
    reason: 'NO_TEMPLATE',
    reasonCode: null,
  })
})

test('reminders require a live owned warranty and reject duplicate plans', async () => {
  const api = harness(phase11Fixture())
  const payload = { deviceId: 'device-alpha', remindOn: '2026-11-01', templateId: 'test-template' }
  assert.equal((await api.call('reminder.create', payload)).ok, true)
  assert.equal((await api.call('reminder.create', payload)).errorCode, 'VALIDATION_ERROR')
  assert.equal(
    (await api.call('reminder.create', { ...payload, deviceId: 'device-beta' })).errorCode,
    'DEVICE_NOT_FOUND',
  )
  assert.equal(
    (await api.call('reminder.create', { ...payload, remindOn: '2026-10-26' })).errorCode,
    'VALIDATION_ERROR',
  )
  assert.equal(api.tables.device_reminders.length, 1)
})

test('a forged timer event from a client cannot trigger scheduled sends', async () => {
  const api = harness(phase11Fixture(), '')
  const result = await api.call(
    '',
    {},
    { Type: 'Timer', TriggerName: 'gearflow-warranty-reminders', SOURCE: 'wx_trigger' },
  )
  assert.equal(result.errorCode, 'UNAUTHORIZED')
  assert.equal(api.sentMessages.length, 0)
})

test('trusted scheduled invocations claim due reminders once and send to the experience version', async () => {
  const api = harness(phase11Fixture())
  await api.call('reminder.create', {
    deviceId: 'device-alpha',
    remindOn: '2026-11-01',
    templateId: 'test-template',
  })
  api.tables.device_reminders[0].remind_on = '2026-10-26'
  api.as('')
  api.source('wx_trigger')
  const event = { Type: 'Timer', TriggerName: 'gearflow-warranty-reminders' }
  const [first, second] = await Promise.all([api.call('', {}, event), api.call('', {}, event)])
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.equal(api.sentMessages.length, 1)
  assert.equal(api.sentMessages[0].miniprogramState, 'trial')
  assert.equal(api.tables.device_reminders[0].status, 'SENT')
})

test('disposing a device cancels a pending subscription reminder', async () => {
  const api = harness(phase11Fixture())
  await api.call('reminder.create', {
    deviceId: 'device-alpha',
    remindOn: '2026-11-01',
    templateId: 'test-template',
  })
  await api.call('device.dispose', {
    deviceId: 'device-alpha',
    status: 'DISCARDED',
    date: '2026-10-26',
    priceCents: null,
    notes: '',
  })
  assert.equal(api.tables.device_reminders[0].status, 'CANCELLED')
})

test('todo reminder authorization stores the mapping and scheduled delivery fills both time fields', async () => {
  const api = harness(phase11Fixture())
  api.templates([
    {
      priTmplId: 'todo-template',
      type: 2,
      title: '待办事项提醒',
      content: '提醒内容{{thing2.DATA}}\n到期日期{{time3.DATA}}\n提醒时间{{time16.DATA}}',
    },
  ])
  assert.equal((await api.call('reminder.config')).data.templateId, 'todo-template')
  const created = await api.call('reminder.create', {
    deviceId: 'device-alpha',
    remindOn: '2026-11-01',
    templateId: 'todo-template',
  })
  assert.equal(created.ok, true)
  assert.deepEqual(JSON.parse(api.tables.device_reminders[0].extra_fields), {
    fields: ['time16'],
    content: true,
  })
  api.tables.device_reminders[0].remind_on = '2026-10-26'
  api.as('')
  api.source('wx_trigger')
  assert.equal(
    (await api.call('', {}, { Type: 'Timer', TriggerName: 'gearflow-warranty-reminders' })).ok,
    true,
  )
  assert.equal(api.sentMessages.length, 1)
  assert.deepEqual(api.sentMessages[0].data, {
    thing2: { value: 'Device alpha保修即将到期' },
    time3: { value: '2026-12-31 23:59' },
    time16: { value: '2026-10-27 09:00' },
  })
  assert.equal(api.tables.device_reminders[0].status, 'SENT')
})

test('existing reminder plans with array metadata remain sendable after the template update', async () => {
  const api = harness(phase11Fixture())
  await api.call('reminder.create', {
    deviceId: 'device-alpha',
    remindOn: '2026-11-01',
    templateId: 'test-template',
  })
  Object.assign(api.tables.device_reminders[0], {
    remind_on: '2026-10-26',
    extra_fields: '["thing4"]',
  })
  api.as('')
  api.source('wx_trigger')
  assert.equal(
    (await api.call('', {}, { Type: 'Timer', TriggerName: 'gearflow-warranty-reminders' })).ok,
    true,
  )
  assert.equal(api.sentMessages.length, 1)
  assert.equal(api.sentMessages[0].data.thing4.value, '请及时查看设备保修状态')
  assert.equal(api.sentMessages[0].data.thing1.value, 'Device alpha')
})
