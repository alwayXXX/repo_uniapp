const { requestAi } = require('./request')

/** openid must come from the current trusted WeChat invocation, never event data. */
async function requestAdvisor({ openid, facts, token, now }, { key, reserve, invoke }) {
  return requestAi({ openid, kind: 'advisor', data: facts, token, now }, { key, reserve, invoke })
}

module.exports = { requestAdvisor }
