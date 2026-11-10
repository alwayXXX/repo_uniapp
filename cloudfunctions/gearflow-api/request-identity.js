// Only use the platform-supplied invocation context, never process.env, event or payload.
// Supports the two runtime context formats documented by the CloudBase Node SDK.
function requestContext(context) {
  if (!context || typeof context !== 'object') return null
  let env
  try {
    if (typeof context.environment === 'string' && context.environment) {
      env = JSON.parse(context.environment)
    } else if (typeof context.environ === 'string') {
      env = Object.create(null)
      for (const part of context.environ.split(';')) {
        const at = part.indexOf('=')
        if (at < 1) continue
        const key = part.slice(0, at)
        if (Object.hasOwn(env, key)) return null
        env[key] = part.slice(at + 1)
      }
    } else return null
  } catch {
    return null
  }
  if (!env || typeof env !== 'object' || Array.isArray(env)) return null
  return env
}

function requestIdentity(context) {
  const env = requestContext(context)
  if (!env) return null
  if (!['wx_client', 'wx_devtools'].includes(env.TCB_SOURCE)) return null
  if (env.WX_APPID !== 'wx8f26567f4d54b3f7') return null
  if (typeof env.WX_OPENID !== 'string' || !env.WX_OPENID || env.WX_OPENID.length > 128) return null
  return env.WX_OPENID
}

module.exports = { requestContext, requestIdentity }
