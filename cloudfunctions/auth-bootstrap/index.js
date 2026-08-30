// 路线说明：本项目数据层已切换为 CloudBase PostgreSQL（docs/PHASE1-FINDINGS.md）。
// 本函数为 wx.cloud 文档数据库变体（Phase 0 原方案），保留作为参考；
// PG 路线下的用户行创建由 Phase 3 的服务端边界（cloudfunctions/users）实现。
const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

// 统一错误响应（docs/API.md 第 1 节）
function fail(code, message) {
  return {
    success: false,
    error: { code, message, requestId: crypto.randomUUID() },
  }
}

// identityId → 确定性 userId：不直接暴露 openid 且全局唯一（docs/DATABASE.md 4.1）
function deriveUserId(openid) {
  return crypto.createHash('sha256').update(`gearflow:user:${openid}`).digest('hex').slice(0, 32)
}

exports.main = async () => {
  // 身份只能来自微信可信上下文；禁止读取 event 中由客户端传入的用户标识
  const { OPENID, UNIONID } = cloud.getWXContext()
  if (!OPENID) {
    return fail('UNAUTHORIZED', '缺少可信微信用户身份')
  }

  const userId = deriveUserId(OPENID)
  const now = Date.now()
  const users = db.collection('users')

  try {
    const existing = await users
      .doc(userId)
      .get()
      .catch(() => null)
    if (existing && existing.data) {
      await users.doc(userId).update({ data: { lastLoginAt: now, updatedAt: now } })
      return {
        success: true,
        data: {
          user: {
            id: userId,
            nickname: existing.data.nickname ?? null,
            avatarUrl: existing.data.avatarUrl ?? null,
            isNewUser: false,
          },
        },
      }
    }

    await users.add({
      data: {
        _id: userId,
        // 显式写入 _openid：使安全规则 doc._openid == auth.openid 对云函数创建的文档同样生效
        _openid: OPENID,
        identityId: OPENID,
        openid: null,
        unionid: UNIONID || null,
        nickname: null,
        avatarUrl: null,
        status: 'ACTIVE',
        lastLoginAt: now,
        createdAt: now,
        updatedAt: now,
      },
    })

    return {
      success: true,
      data: {
        user: { id: userId, nickname: null, avatarUrl: null, isNewUser: true },
      },
    }
  } catch (err) {
    // 隐私：日志禁止输出 OpenID / 身份信息（AGENTS.md 隐私优先）
    console.error('auth-bootstrap failed:', err && err.errCode ? err.errCode : 'unknown')
    return fail('IDENTITY_BOOTSTRAP_FAILED', '身份初始化失败，请稍后重试')
  }
}
