const { createHash } = require('node:crypto')
const { consumeSignedGrant } = require('./grant')
const { canonicalJson } = require('./canonical')
const { validateAdvisorFacts, generateAdvisor } = require('./advisor')
const { validateAnnualFacts, generateAnnual } = require('./annual')
const { validateImage, recognizeImage } = require('./image-recognition')

const routes = {
  advisor: { validate: validateAdvisorFacts, generate: generateAdvisor },
  annual: { validate: validateAnnualFacts, generate: generateAnnual },
  image: { validate: validateImage, generate: recognizeImage },
}

function normalizeAiRequest(kind, data) {
  if (!Object.hasOwn(routes, kind)) throw new Error('INVALID_AI_INPUT')
  const route = routes[kind]
  const normalized = route.validate(data)
  const digest = createHash('sha256').update(canonicalJson(normalized), 'utf8').digest('hex')
  return { route, normalized, digest }
}

/** The grant is issued server-to-server and never returned to the client. */
async function requestServerAi({ kind, data, token, now }, { key, reserve, invoke }) {
  const { route, normalized, digest } = normalizeAiRequest(kind, data)
  if (!(await consumeSignedGrant({ key, kind, digest, token, now }, reserve)))
    throw new Error('AI_GRANT_REJECTED')
  return route.generate(normalized, invoke)
}

module.exports = { requestServerAi, normalizeAiRequest }
