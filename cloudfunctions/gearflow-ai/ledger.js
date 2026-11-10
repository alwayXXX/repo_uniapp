const { createHash } = require('node:crypto')

const DAILY_LIMIT = 10

/** This adapter is not enabled until table permissions and account deletion are verified. */
module.exports = function createLedger({ db, selectRows, insertRow, deleteRows }) {
  function quotaId(openid, day) {
    return createHash('sha256')
      .update(JSON.stringify(['gearflow-ai-quota-v1', openid, day]))
      .digest('hex')
  }

  function dayString(now) {
    if (!Number.isSafeInteger(now) || now < 0) throw new Error('INVALID_TIME')
    return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
  }

  async function findQuota(id, openid) {
    const rows = await selectRows(
      db.from('ai_daily_quota').select('*').eq('id', id).eq('openid', openid).limit(1),
    )
    return rows[0] || null
  }

  async function reserveQuota(openid, now) {
    if (typeof openid !== 'string' || !openid || openid.length > 128)
      throw new Error('INVALID_OWNER')
    const day = dayString(now)
    const id = quotaId(openid, day)
    let row = await findQuota(id, openid)
    if (!row) {
      try {
        await insertRow('ai_daily_quota', { id, openid, quota_day: day, used_count: 0 })
      } catch (error) {
        row = await findQuota(id, openid)
        if (!row) throw error
      }
      row ??= await findQuota(id, openid)
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!row) throw new Error('QUOTA_UNAVAILABLE')
      const count = Number(row.used_count)
      if (!Number.isInteger(count) || count < 0) throw new Error('QUOTA_UNAVAILABLE')
      if (count >= DAILY_LIMIT) return false
      const updated = await selectRows(
        db
          .from('ai_daily_quota')
          .update({ used_count: count + 1 })
          .eq('id', id)
          .eq('openid', openid)
          .eq('used_count', count)
          .select('id'),
      )
      if (updated.length === 1) return true
      row = await findQuota(id, openid)
    }
    throw new Error('QUOTA_CONFLICT')
  }

  async function recordGrant(openid, claims) {
    if (
      typeof openid !== 'string' ||
      !openid ||
      typeof claims?.nonce !== 'string' ||
      !/^[a-zA-Z0-9-]{16,64}$/.test(claims.nonce) ||
      !/^[a-f0-9]{64}$/.test(claims.owner) ||
      !/^[a-f0-9]{64}$/.test(claims.digest) ||
      !['advisor', 'annual', 'image'].includes(claims.kind) ||
      !Number.isSafeInteger(claims.expiresAt)
    )
      throw new Error('INVALID_GRANT')
    await insertRow('ai_grants', {
      id: claims.nonce,
      openid,
      kind: claims.kind,
      input_digest: claims.digest,
      expires_at_ms: claims.expiresAt,
      status: 'ISSUED',
    })
  }

  async function consume(claims, now) {
    if (!claims || !Number.isSafeInteger(now)) return false
    const rows = await selectRows(
      db
        .from('ai_grants')
        .update({ status: 'USED' })
        .eq('id', claims.nonce)
        .eq('kind', claims.kind)
        .eq('input_digest', claims.digest)
        .eq('status', 'ISSUED')
        .gt('expires_at_ms', now)
        .select('id'),
    )
    return rows.length === 1
  }

  async function clearOwner(openid) {
    if (typeof openid !== 'string' || !openid) throw new Error('INVALID_OWNER')
    await deleteRows(db.from('ai_grants').delete().eq('openid', openid))
    await deleteRows(db.from('ai_daily_quota').delete().eq('openid', openid))
  }

  return { reserveQuota, recordGrant, consume, clearOwner }
}
