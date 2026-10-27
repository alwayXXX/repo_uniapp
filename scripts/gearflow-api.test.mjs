import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

const source = readFileSync(
  new URL('../cloudfunctions/gearflow-api/index.js', import.meta.url),
  'utf8',
)
const privateTables = [
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

  class Query {
    constructor(table) {
      this.table = table
      this.filters = []
      this.operation = 'select'
      this.maximum = Infinity
    }
    select() {
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
      const selected = tables[this.table].filter(matches).slice(0, this.maximum)
      if (this.operation === 'select') return { data: structuredClone(selected) }
      writes.push({ table: this.table, operation: this.operation })
      if (this.operation === 'insert') tables[this.table].push(this.row)
      if (this.operation === 'update') selected.forEach((row) => Object.assign(row, this.row))
      if (this.operation === 'delete')
        tables[this.table] = tables[this.table].filter((row) => !matches(row))
      return { data: [] }
    }
  }

  const module = { exports: {} }
  runInNewContext(source, {
    exports: module.exports,
    require(name) {
      if (name === 'node:crypto') return { randomUUID }
      if (name === '@cloudbase/node-sdk')
        return { init: () => ({ rdb: () => ({ from: (table) => new Query(table) }) }) }
      if (name === 'wx-server-sdk') return { init() {}, getWXContext: () => ({ OPENID: owner }) }
      throw new Error(`Unexpected dependency: ${name}`)
    },
    console: { error() {} },
  })
  return {
    tables,
    writes,
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
