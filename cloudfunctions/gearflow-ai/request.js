const { createHash } = require('node:crypto')
const { consumeGrant } = require('./grant')
const { canonicalJson } = require('./canonical')
const { validateAdvisorFacts, generateAdvisor } = require('./advisor')
const { validateAnnualFacts, generateAnnual } = require('./annual')
const { validateImage, recognizeImage } = require('./image-recognition')

const routes = {
  advisor: { validate: validateAdvisorFacts, generate: generateAdvisor },
  annual: { validate: validateAnnualFacts, generate: generateAnnual },
  image: { validate: validateImage, generate: recognizeImage },
}

/** openid must come from a trusted runtime, never directly from client input. */
async function requestAi({ openid, kind, data, token, now }, { key, reserve, invoke }) {
  if (!Object.hasOwn(routes, kind)) throw new Error('INVALID_AI_INPUT')
  const route = routes[kind]
  const normalized = route.validate(data)
  const digest = createHash('sha256').update(canonicalJson(normalized), 'utf8').digest('hex')
  if (!(await consumeGrant({ key, openid, kind, digest, token, now }, reserve)))
    throw new Error('AI_GRANT_REJECTED')
  return route.generate(normalized, invoke)
}

module.exports = { requestAi }
