const { issueGrant, verifyGrant, consumeSignedGrant } = require('./grant')
const { normalizeAiRequest } = require('./request')
const { parseAdvisorResult } = require('./advisor')
const { parseAnnualResult } = require('./annual')
const { parseRecognition } = require('./image-recognition')

/** Dependency injection keeps the gateway disabled until persistent security is configured. */
function createGateway({ key, authorize, ledger, callModelEnv, clock = Date.now }) {
  async function request({ openid, kind, data, confirmed }) {
    if (typeof key !== 'string' || !/^[a-f0-9]{64,}$/i.test(key)) throw new Error('AI_UNAVAILABLE')
    if (
      typeof openid !== 'string' ||
      !openid ||
      confirmed !== true ||
      typeof authorize !== 'function'
    )
      throw new Error('AI_CONSENT_REQUIRED')
    if (!(await authorize(openid))) throw new Error('AI_CONSENT_REQUIRED')
    const { normalized, digest } = normalizeAiRequest(kind, data)
    const now = clock()
    if (!(await ledger.reserveQuota(openid, now))) throw new Error('AI_RATE_LIMITED')
    const token = issueGrant({ key, openid, kind, digest, now })
    const claims = verifyGrant({ key, openid, kind, digest, token, now })
    if (!claims) throw new Error('AI_GRANT_REJECTED')
    await ledger.recordGrant(openid, claims)
    if (typeof callModelEnv !== 'function') throw new Error('AI_UNAVAILABLE')
    // Token is sent only from this trusted server to the AI function, never to the client.
    const response = await callModelEnv({ kind, data: normalized, token })
    const serialized = JSON.stringify(response)
    if (kind === 'advisor') return parseAdvisorResult(serialized)
    if (kind === 'annual') return parseAnnualResult(serialized)
    return parseRecognition(serialized)
  }

  async function consume({ kind, digest, token }) {
    const now = clock()
    return consumeSignedGrant({ key, kind, digest, token, now }, (claims) =>
      ledger.consume(claims, now),
    )
  }

  return { request, consume }
}

module.exports = { createGateway }
