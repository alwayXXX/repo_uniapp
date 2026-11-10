import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const {
  issueGrant,
  verifyGrant,
  consumeSignedGrant,
} = require('../cloudfunctions/gearflow-ai/grant.js')
const base = {
  key: 'ab'.repeat(32),
  openid: 'synthetic-owner',
  kind: 'advisor',
  digest: '12'.repeat(32),
  now: 1_700_000_000_000,
  nonce: 'synthetic-nonce-1234',
}

test('grant binds the owner, action, input digest, and expiry without exposing identity', () => {
  const token = issueGrant(base)
  assert.equal(token.includes(base.openid), false)
  assert.ok(verifyGrant({ ...base, token }))
  for (const replacement of [
    { openid: 'another-owner' },
    { kind: 'image' },
    { digest: '13'.repeat(32) },
    { key: 'cd'.repeat(32) },
    { now: base.now + 60_000 },
    { now: base.now - 6000 },
  ])
    assert.equal(verifyGrant({ ...base, ...replacement, token }), null)
  assert.equal(verifyGrant({ ...base, token: `${token.slice(0, -1)}!` }), null)
})

test('one-time reservation blocks replay and fails closed on unavailable storage', async () => {
  const token = issueGrant(base)
  const seen = new Set()
  const reserve = async ({ nonce }) => {
    if (seen.has(nonce)) return false
    seen.add(nonce)
    return true
  }
  const results = await Promise.all([
    consumeSignedGrant({ ...base, token }, reserve),
    consumeSignedGrant({ ...base, token }, reserve),
  ])
  assert.deepEqual(results.sort(), [false, true])
  assert.equal(
    await consumeSignedGrant({ ...base, token }, async () => {
      throw new Error('offline')
    }),
    false,
  )
  assert.equal(await consumeSignedGrant({ ...base, token }, undefined), false)
})

test('unsafe secrets, timestamps, and request types cannot be issued', () => {
  for (const replacement of [
    { key: 'weak' },
    { kind: 'chat' },
    { now: Number.MAX_SAFE_INTEGER },
    { nonce: 'short' },
  ])
    assert.throws(() => issueGrant({ ...base, ...replacement }), /INVALID_GRANT_INPUT/)
})
