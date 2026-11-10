import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
import { test } from 'node:test'
const require = createRequire(import.meta.url)
const { createGateway } = require('../cloudfunctions/gearflow-ai/gateway.js')
const { requestServerAi } = require('../cloudfunctions/gearflow-ai/request.js')

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
const now = 1_700_000_000_000

test('server-to-server flow keeps the grant and identity out of the client result', async () => {
  const grants = new Map()
  let calls = 0
  let envelope
  const ledger = {
    async reserveQuota() {
      return true
    },
    async recordGrant(_openid, claims) {
      grants.set(claims.nonce, { ...claims, used: false })
    },
    async consume(claims) {
      const row = grants.get(claims.nonce)
      if (!row || row.used) return false
      row.used = true
      return true
    },
  }
  let gateway
  gateway = createGateway({
    key,
    ledger,
    clock: () => now,
    authorize: async () => true,
    callModelEnv: async (input) => {
      envelope = input
      return requestServerAi(
        { ...input, now },
        {
          key,
          reserve: (claims) =>
            gateway.consume({ kind: claims.kind, digest: claims.digest, token: input.token }),
          invoke: async () => {
            calls++
            return { text: '{"suggestions":["检查保修"],"missing":[]}' }
          },
        },
      )
    },
  })
  const result = await gateway.request({
    openid: 'synthetic-owner',
    kind: 'advisor',
    data: facts,
    confirmed: true,
  })
  assert.deepEqual(result, { suggestions: ['检查保修'], missing: [] })
  assert.equal(JSON.stringify(result).includes(envelope.token), false)
  assert.equal(JSON.stringify(envelope).includes('synthetic-owner'), false)
  await assert.rejects(
    requestServerAi(
      { ...envelope, now },
      {
        key,
        reserve: (claims) =>
          gateway.consume({ kind: claims.kind, digest: claims.digest, token: envelope.token }),
        invoke: () => {
          calls++
        },
      },
    ),
    /AI_GRANT_REJECTED/,
  )
  assert.equal(calls, 1)
})

test('unconfirmed or unauthorized requests never consume quota or call the model', async () => {
  let calls = 0
  const gateway = createGateway({
    key,
    authorize: async () => false,
    ledger: {
      reserveQuota: () => {
        calls++
      },
    },
    callModelEnv: () => {
      calls++
    },
    clock: () => now,
  })
  await assert.rejects(
    gateway.request({ openid: 'synthetic-owner', kind: 'advisor', data: facts, confirmed: false }),
    /AI_CONSENT_REQUIRED/,
  )
  await assert.rejects(
    gateway.request({ openid: 'synthetic-owner', kind: 'advisor', data: facts, confirmed: true }),
    /AI_CONSENT_REQUIRED/,
  )
  assert.equal(calls, 0)
})

test('missing server key fails before quota is consumed', async () => {
  let quotaCalls = 0
  const gateway = createGateway({
    key: '',
    authorize: async () => true,
    ledger: {
      reserveQuota: () => {
        quotaCalls++
      },
    },
    clock: () => now,
  })
  await assert.rejects(
    gateway.request({ openid: 'synthetic-owner', kind: 'advisor', data: facts, confirmed: true }),
    /AI_UNAVAILABLE/,
  )
  assert.equal(quotaCalls, 0)
})
