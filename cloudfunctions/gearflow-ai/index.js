const cloud = require('wx-server-sdk')
const { requestServerAi } = require('./request')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV, timeout: 60000 })
const BUSINESS_ENV = 'myrepo-d7go4fyg918beac63'
const MODEL = 'deepseek-v4.1-flash'
const SAFE_ERRORS = new Set([
  'INVALID_AI_INPUT',
  'INVALID_AI_RESULT',
  'AI_GRANT_REJECTED',
  'AI_UNAVAILABLE',
])

exports.main = async (event) => {
  const kind = event?.kind
  const token = event?.token
  try {
    const data = await requestServerAi(
      { kind, data: event?.data, token, now: Date.now() },
      {
        key: process.env.GEARFLOW_AI_KEY,
        reserve: async (claims) => {
          const response = await cloud.callFunction({
            name: 'gearflow-api',
            config: { env: BUSINESS_ENV },
            data: {
              action: 'ai.consume',
              payload: { kind: claims.kind, digest: claims.digest, token },
            },
          })
          return response?.result?.ok === true && response.result.data?.consumed === true
        },
        invoke: async (input) =>
          cloud
            .ai()
            .createModel('cloudbase')
            .generateText({ model: MODEL, ...input }),
      },
    )
    return { ok: true, data }
  } catch (error) {
    const code =
      typeof error?.message === 'string' && SAFE_ERRORS.has(error.message)
        ? error.message
        : 'AI_UNAVAILABLE'
    return { ok: false, errorCode: code }
  }
}
