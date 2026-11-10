const { createHash } = require('node:crypto')
const { consumeGrant } = require('./grant')
const { validateAdvisorFacts, generateAdvisor } = require('./advisor')

/** openid must come from the current trusted WeChat invocation, never event data. */
async function requestAdvisor({ openid, facts, token, now }, { key, reserve, invoke }) {
  const normalized = validateAdvisorFacts(facts)
  const digest = createHash('sha256').update(JSON.stringify(normalized), 'utf8').digest('hex')
  const permitted = await consumeGrant(
    { key, openid, kind: 'advisor', digest, token, now },
    reserve,
  )
  if (!permitted) throw new Error('AI_GRANT_REJECTED')
  return generateAdvisor(normalized, invoke)
}

module.exports = { requestAdvisor }
