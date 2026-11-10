import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { requestServerAi } = require('../cloudfunctions/gearflow-ai/request.js')
const { issueGrant } = require('../cloudfunctions/gearflow-ai/grant.js')
const { canonicalJson } = require('../cloudfunctions/gearflow-ai/canonical.js')
const facts = {
  asOf: '2026-11-10',
  category: '电脑',
  brand: 'Example',
  model: 'M1',
  status: 'IN_USE',
  purchaseDate: '2024-01-01',
  warrantyEndDate: null,
  maintenanceCount: 0,
  knownMaintenanceCents: 0,
  maintenanceCostUnknownCount: 0,
}
const key = 'ab'.repeat(32)
const openid = 'synthetic-owner'
const now = 1_700_000_000_000
const digest = createHash('sha256').update(canonicalJson(facts)).digest('hex')
const token = issueGrant({
  key,
  openid,
  kind: 'advisor',
  digest,
  now,
  nonce: 'synthetic-nonce-1234',
})

test('valid request consumes a grant once before invoking the model', async () => {
  let reserved = false
  let calls = 0
  const deps = {
    key,
    reserve: async () => {
      if (reserved) return false
      reserved = true
      return true
    },
    invoke: async () => {
      calls++
      return { text: '{"suggestions":["检查保修"],"missing":[]}' }
    },
  }
  const input = { kind: 'advisor', data: facts, token, now }
  assert.deepEqual(await requestServerAi(input, deps), { suggestions: ['检查保修'], missing: [] })
  await assert.rejects(requestServerAi(input, deps), /AI_GRANT_REJECTED/)
  assert.equal(calls, 1)
})

test('altered inputs, invalid tokens, and unavailable reservation never call the model', async () => {
  let calls = 0
  const deps = {
    key,
    reserve: async () => {
      throw new Error('offline')
    },
    invoke: async () => {
      calls++
      return { text: '{}' }
    },
  }
  for (const override of [{ token: `${token}!` }, { data: { ...facts, brand: 'Changed' } }, {}])
    await assert.rejects(
      requestServerAi({ kind: 'advisor', data: facts, token, now, ...override }, deps),
      /AI_GRANT_REJECTED/,
    )
  assert.equal(calls, 0)
})
