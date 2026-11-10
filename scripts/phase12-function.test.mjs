import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

const require = createRequire(import.meta.url)
const { issueGrant } = require('../cloudfunctions/gearflow-ai/grant.js')
const { canonicalJson } = require('../cloudfunctions/gearflow-ai/canonical.js')
const source = readFileSync(
  new URL('../cloudfunctions/gearflow-ai/index.js', import.meta.url),
  'utf8',
)
const key = 'ab'.repeat(32)
const now = 1_700_000_000_000
const facts = {
  asOf: '2026-11-10',
  category: '电脑',
  brand: 'Example',
  model: 'M1',
  status: 'IN_USE',
  purchaseDate: null,
  warrantyEndDate: null,
  maintenanceCount: 0,
  knownMaintenanceCents: 0,
  maintenanceCostUnknownCount: 0,
}

function harness() {
  let used = false
  let calls = 0
  const module = { exports: {} }
  const cloud = {
    init() {},
    async callFunction(input) {
      assert.equal(input.name, 'gearflow-api')
      assert.equal(input.data.action, 'ai.consume')
      if (used) return { result: { ok: true, data: { consumed: false } } }
      used = true
      return { result: { ok: true, data: { consumed: true } } }
    },
    ai: () => ({
      createModel: () => ({
        generateText: async () => {
          calls++
          return { text: '{"suggestions":["检查保修"],"missing":[]}' }
        },
      }),
    }),
  }
  runInNewContext(source, {
    exports: module.exports,
    require: (name) =>
      name === 'wx-server-sdk' ? cloud : require('../cloudfunctions/gearflow-ai/request.js'),
    process: { env: { GEARFLOW_AI_KEY: key } },
    Date: { now: () => now },
  })
  return { call: module.exports.main, calls: () => calls }
}

test('AI function invokes the model only after signed grant consumption', async () => {
  const api = harness()
  const digest = createHash('sha256').update(canonicalJson(facts)).digest('hex')
  const token = issueGrant({
    key,
    openid: 'synthetic-owner',
    kind: 'advisor',
    digest,
    now,
    nonce: 'synthetic-nonce-1234',
  })
  const request = { kind: 'advisor', data: facts, token }
  assert.deepEqual(JSON.parse(JSON.stringify(await api.call(request))), {
    ok: true,
    data: { suggestions: ['检查保修'], missing: [] },
  })
  assert.equal((await api.call(request)).errorCode, 'AI_GRANT_REJECTED')
  assert.equal(api.calls(), 1)
})

test('AI function rejects missing credentials and never logs or returns submitted input', async () => {
  const api = harness()
  const response = await api.call({
    kind: 'advisor',
    data: facts,
    token: 'invalid',
    openid: 'private-identity',
  })
  assert.equal(response.errorCode, 'AI_GRANT_REJECTED')
  assert.equal(JSON.stringify(response).includes('private-identity'), false)
  assert.equal(api.calls(), 0)
})
