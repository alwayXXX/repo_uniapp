const { createHmac, randomUUID, timingSafeEqual } = require('node:crypto')

const KINDS = new Set(['advisor', 'annual', 'image'])
const LIFETIME_MS = 60_000

function mac(key, prefix, value) {
  return createHmac('sha256', key).update(prefix).update(value).digest('hex')
}

function validKey(key) {
  return typeof key === 'string' && /^[a-f0-9]{64,}$/i.test(key)
}

function equalHex(left, right) {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
}

function identity(key, openid) {
  return mac(key, 'gearflow-ai-owner-v1:', openid)
}

/** Only call after checking trusted identity and recorded policy consent. */
function issueGrant({ key, openid, kind, digest, now = Date.now(), nonce = randomUUID() }) {
  if (
    !validKey(key) ||
    typeof openid !== 'string' ||
    !openid ||
    openid.length > 128 ||
    !KINDS.has(kind) ||
    !/^[a-f0-9]{64}$/.test(digest) ||
    !Number.isSafeInteger(now) ||
    now < 0 ||
    now > Number.MAX_SAFE_INTEGER - LIFETIME_MS ||
    !/^[a-zA-Z0-9-]{16,64}$/.test(nonce)
  )
    throw new Error('INVALID_GRANT_INPUT')
  const claims = {
    v: 1,
    owner: identity(key, openid),
    kind,
    digest,
    nonce,
    issuedAt: now,
    expiresAt: now + LIFETIME_MS,
  }
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `${body}.${mac(key, 'gearflow-ai-grant-v1:', body)}`
}

/** No caller-provided identity is trusted: openid must come from the runtime. */
function verifyGrant({ key, openid, kind, digest, token, now = Date.now() }) {
  if (
    !validKey(key) ||
    typeof openid !== 'string' ||
    !openid ||
    !KINDS.has(kind) ||
    !/^[a-f0-9]{64}$/.test(digest) ||
    typeof token !== 'string' ||
    token.length > 2048 ||
    !Number.isSafeInteger(now)
  )
    return null
  const parts = token.split('.')
  if (
    parts.length !== 2 ||
    !/^[A-Za-z0-9_-]+$/.test(parts[0]) ||
    !equalHex(parts[1], mac(key, 'gearflow-ai-grant-v1:', parts[0]))
  )
    return null
  let claims
  try {
    claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (
    !claims ||
    claims.v !== 1 ||
    typeof claims.owner !== 'string' ||
    !equalHex(claims.owner, identity(key, openid)) ||
    claims.kind !== kind ||
    claims.digest !== digest ||
    typeof claims.nonce !== 'string' ||
    !/^[a-zA-Z0-9-]{16,64}$/.test(claims.nonce) ||
    !Number.isSafeInteger(claims.issuedAt) ||
    !Number.isSafeInteger(claims.expiresAt) ||
    claims.expiresAt - claims.issuedAt !== LIFETIME_MS ||
    claims.issuedAt > now + 5000 ||
    now >= claims.expiresAt
  )
    return null
  return { owner: claims.owner, kind, digest, nonce: claims.nonce, expiresAt: claims.expiresAt }
}

/** A durable, atomic reserve operation must enforce replay and per-user limits. */
async function consumeGrant(input, reserve) {
  const claims = verifyGrant(input)
  if (!claims || typeof reserve !== 'function') return false
  try {
    return (await reserve(claims)) === true
  } catch {
    return false
  }
}

module.exports = { issueGrant, verifyGrant, consumeGrant }
