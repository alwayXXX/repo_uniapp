const { createHash } = require('node:crypto')
const { consumeGrant, consumeSignedGrant } = require('./grant')
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

async function requestWithGrant(
  { openid, kind, data, token, now },
  { key, reserve, invoke },
  consume,
) {
  const { route, normalized, digest } = normalizeAiRequest(kind, data)
  if (!(await consume({ key, openid, kind, digest, token, now }, reserve)))
    throw new Error('AI_GRANT_REJECTED')
  return route.generate(normalized, invoke)
}

/** openid must come from a trusted runtime, never directly from client input. */
async function requestAi(input, deps) {
  return requestWithGrant(input, deps, consumeGrant)
}

/** Use only when the grant is issued server-to-server and never returned to the client. */
async function requestServerAi(input, deps) {
  return requestWithGrant(input, deps, consumeSignedGrant)
}

module.exports = { requestAi, requestServerAi, normalizeAiRequest }
