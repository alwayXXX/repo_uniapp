/**
 * wx-login：GearFlow 自定义登录入口（OPS-7，见 docs/OPS7-LOGIN-DESIGN.md）。
 * 输入 uni.login 的 code，换取 openid 后签发 CloudBase 自定义登录票据。
 * 密钥全部来自环境变量；openid/errcode 不落日志、不回传前端。
 */
const cloudbase = require('@cloudbase/node-sdk')

let app

function getApp() {
  if (!app) {
    const credentials = JSON.parse(process.env.TCB_CREDENTIALS_JSON)
    app = cloudbase.init({ env: process.env.TCB_ENV, credentials })
  }
  return app
}

function extractCode(event) {
  if (event && typeof event.code === 'string') return event.code
  if (event && typeof event.body === 'string') {
    try {
      const body = JSON.parse(event.body)
      return typeof body.code === 'string' ? body.code : ''
    } catch {
      return ''
    }
  }
  return ''
}

exports.main = async (event) => {
  const code = extractCode(event)
  if (!code) {
    return { ok: false, errorCode: 'VALIDATION_ERROR' }
  }
  try {
    const params = new URLSearchParams({
      appid: process.env.WX_APPID,
      secret: process.env.WX_SECRET,
      js_code: code,
      grant_type: 'authorization_code',
    })
    const wxRes = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${params.toString()}`)
    const wxData = await wxRes.json()
    if (!wxData || typeof wxData.openid !== 'string' || !wxData.openid) {
      // errcode/errmsg 可能携带 appid 等上下文，不落日志
      return { ok: false, errorCode: 'UNAUTHORIZED' }
    }
    const ticket = await getApp().auth().createTicket(wxData.openid, { refresh: true })
    return { ok: true, ticket }
  } catch (e) {
    console.log('wx-login invoke failed: internal error')
    return { ok: false, errorCode: 'INTERNAL_ERROR' }
  }
}
