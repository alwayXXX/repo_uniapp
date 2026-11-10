import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const createLedger = require('../cloudfunctions/gearflow-ai/ledger.js')
const { issueGrant, verifyGrant, consumeGrant } = require('../cloudfunctions/gearflow-ai/grant.js')

function harness() {
  const tables = { ai_daily_quota: [], ai_grants: [] }
  const db = {
    from: (table) => {
      const q = {
        table,
        filters: [],
        patch: null,
        deleting: false,
        select() {
          return this
        },
        update(value) {
          this.patch = value
          return this
        },
        delete() {
          this.deleting = true
          return this
        },
        eq(key, value) {
          this.filters.push((row) => row[key] === value)
          return this
        },
        gt(key, value) {
          this.filters.push((row) => row[key] > value)
          return this
        },
        limit() {
          return this
        },
      }
      return q
    },
  }
  const selectRows = async (q) => {
    const matches = tables[q.table].filter((row) => q.filters.every((predicate) => predicate(row)))
    if (q.patch) for (const row of matches) Object.assign(row, q.patch)
    return matches.map((row) => ({ ...row }))
  }
  const insertRow = async (table, row) => {
    if (tables[table].some((item) => item.id === row.id)) throw new Error('DUPLICATE')
    tables[table].push({ ...row })
  }
  const deleteRows = async (q) => {
    tables[q.table] = tables[q.table].filter(
      (row) => !q.filters.every((predicate) => predicate(row)),
    )
  }
  return { tables, ledger: createLedger({ db, selectRows, insertRow, deleteRows }) }
}

test('quota updates remain bounded under concurrent requests and isolate users', async () => {
  const { tables, ledger } = harness()
  const now = Date.UTC(2026, 10, 10)
  const results = await Promise.allSettled(
    Array.from({ length: 30 }, () => ledger.reserveQuota('owner-a', now)),
  )
  assert.ok(results.filter((result) => result.status === 'fulfilled' && result.value).length <= 10)
  assert.ok(tables.ai_daily_quota[0].used_count <= 10)
  assert.equal(await ledger.reserveQuota('owner-b', now), true)
})

test('a stored grant can be consumed only once, and cleanup affects only its owner', async () => {
  const { tables, ledger } = harness()
  const input = {
    key: 'ab'.repeat(32),
    openid: 'owner-a',
    kind: 'advisor',
    digest: '12'.repeat(32),
    now: 1000000,
    nonce: 'synthetic-nonce-1234',
  }
  const token = issueGrant(input)
  const claims = verifyGrant({ ...input, token })
  await ledger.recordGrant(input.openid, claims)
  const responses = await Promise.all([
    consumeGrant({ ...input, token }, (item) => ledger.consume(item, input.now)),
    consumeGrant({ ...input, token }, (item) => ledger.consume(item, input.now)),
  ])
  assert.deepEqual(responses.sort(), [false, true])
  await ledger.reserveQuota('owner-a', input.now)
  await ledger.reserveQuota('owner-b', input.now)
  await ledger.clearOwner('owner-a')
  assert.equal(tables.ai_grants.length, 0)
  assert.equal(tables.ai_daily_quota.length, 1)
  assert.equal(tables.ai_daily_quota[0].openid, 'owner-b')
})
