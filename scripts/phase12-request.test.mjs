import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { test } from 'node:test'
const require = createRequire(import.meta.url)
const { issueGrant } = require('../cloudfunctions/gearflow-ai/grant.js')
const { canonicalJson } = require('../cloudfunctions/gearflow-ai/canonical.js')
const { requestAi } = require('../cloudfunctions/gearflow-ai/request.js')
const key = 'ab'.repeat(32)
const openid = 'synthetic-owner'
const now = 1_700_000_000_000
const image = {
  mimeType: 'image/png',
  content: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64'),
}
const digest = createHash('sha256').update(canonicalJson(image)).digest('hex')
const token = issueGrant({ key, openid, kind: 'image', digest, now, nonce: 'synthetic-nonce-1234' })

test('image requests require a matching one-time signed input before model invocation', async () => {
  let count = 0
  const deps = {
    key,
    reserve: async () => true,
    invoke: async () => {
      count++
      return { text: '{"category":"phone","brand":null,"model":null}' }
    },
  }
  const result = await requestAi({ openid, kind: 'image', data: image, token, now }, deps)
  assert.deepEqual(result, { category: 'phone', brand: null, model: null })
  await assert.rejects(
    requestAi({ openid: 'other', kind: 'image', data: image, token, now }, deps),
    /AI_GRANT_REJECTED/,
  )
  assert.equal(count, 1)
})

test('an unknown request type never reserves or invokes a model', async () => {
  let calls = 0
  await assert.rejects(
    requestAi(
      { openid, kind: '__proto__', data: image, token, now },
      {
        key,
        reserve: () => {
          calls++
        },
        invoke: () => {
          calls++
        },
      },
    ),
    /INVALID_AI_INPUT/,
  )
  assert.equal(calls, 0)
})
