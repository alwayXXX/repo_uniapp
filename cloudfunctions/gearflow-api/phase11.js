const { randomUUID, createHash } = require('node:crypto')
const {
  annualReport,
  decodeAttachment,
  validDate,
  reminderTemplate,
  reminderData,
} = require('./phase11-domain')

module.exports = function createPhase11(deps) {
  const {
    db,
    cloud,
    storage,
    fail,
    selectRows,
    insertRow,
    updateRows,
    deleteRows,
    getOwnedDevice,
    findUser,
    appendTimeline,
    todayString,
    nowValue,
    text,
    mapDevice,
    mapWarranty,
    mapMaintenance,
  } = deps

  async function readAll(table, owner, field, value) {
    const rows = []
    const seen = new Set()
    for (let offset = 0; ; offset += 100) {
      let query = db.from(table).select('*')
      if (owner !== null) query = query.eq('openid', owner)
      if (field) query = query.eq(field, value)
      const page = await selectRows(
        query.order('id', { ascending: true }).range(offset, offset + 99),
      )
      for (const row of page) {
        if (seen.has(row.id)) fail('INTERNAL_ERROR', 'Data changed; retry')
        seen.add(row.id)
        rows.push(row)
      }
      if (page.length < 100) return rows
      if (rows.length >= 100000) fail('RATE_LIMITED')
    }
  }

  async function activeOwner(owner) {
    const user = await findUser(owner)
    if (!user || user.status !== 'ACTIVE') fail('UNAUTHORIZED')
    const consent = await selectRows(
      db
        .from('consent_records')
        .select('id')
        .eq('openid', owner)
        .eq('policy_type', 'PRIVACY')
        .eq('policy_version', '1.1.0')
        .limit(1),
    )
    if (!consent.length) fail('FORBIDDEN', 'Current privacy consent required')
  }

  async function cancelReminders(owner, deviceId) {
    let query = db
      .from('device_reminders')
      .update({ status: 'CANCELLED', updated_at: nowValue() })
      .eq('openid', owner)
      .eq('status', 'PENDING')
    if (deviceId) query = query.eq('device_id', deviceId)
    await updateRows(query)
  }

  async function deleteCloudFile(fileID) {
    const result = await storage.deleteFile({ fileList: [fileID] })
    if (
      !Array.isArray(result.fileList) ||
      result.fileList.length !== 1 ||
      !(
        ['SUCCESS', 'STORAGE_FILE_NONEXIST'].includes(result.fileList[0].code) ||
        [0, -503003].includes(result.fileList[0].status)
      )
    )
      fail('INTERNAL_ERROR', 'File cleanup failed')
  }

  async function cleanupAttachments(owner, deviceId) {
    const rows = await readAll('device_attachments', owner, deviceId ? 'device_id' : null, deviceId)
    for (const row of rows) {
      if (
        row.status === 'UPLOADING' &&
        Date.now() - Date.parse(`${String(row.created_at).replace(' ', 'T')}Z`) < 120000
      )
        fail('RATE_LIMITED', 'Upload in progress; retry')
      if (row.file_id) await deleteCloudFile(row.file_id)
      await deleteRows(db.from('device_attachments').delete().eq('id', row.id).eq('openid', owner))
    }
  }

  async function dispose(owner, payload) {
    const device = await getOwnedDevice(owner, payload.deviceId)
    if (
      !['SOLD', 'DISCARDED'].includes(payload.status) ||
      !validDate(payload.date) ||
      payload.date > todayString() ||
      (device.purchase_date && payload.date < device.purchase_date)
    )
      fail('VALIDATION_ERROR')
    const amount = payload.priceCents
    if (amount !== null && (!Number.isInteger(amount) || amount < 0 || amount > 2147483647))
      fail('VALIDATION_ERROR')
    const notes = text(payload.notes, 1000, 'notes')
    if (
      device.status === payload.status &&
      device.disposal_date === payload.date &&
      (device.disposal_price_cents == null ? null : Number(device.disposal_price_cents)) ===
        amount &&
      (device.disposal_notes || null) === notes
    )
      return { ok: true }
    await cancelReminders(owner, device.id)
    const changed = await selectRows(
      db
        .from('devices')
        .update({
          status: payload.status,
          disposal_date: payload.date,
          disposal_price_cents: amount,
          disposal_notes: notes,
          updated_at: nowValue(),
        })
        .eq('id', device.id)
        .eq('openid', owner)
        .eq('updated_at', device.updated_at)
        .select('id'),
    )
    if (!changed.length) fail('RATE_LIMITED', 'Device changed; retry')
    try {
      await appendTimeline(
        owner,
        device.id,
        payload.status,
        payload.date,
        payload.status === 'SOLD' ? '设备已出售' : '设备已报废',
        '处置信息已更新',
        { changedFields: ['status', 'disposal'] },
      )
    } catch (error) {
      await updateRows(
        db
          .from('devices')
          .update({
            status: device.status,
            disposal_date: device.disposal_date || null,
            disposal_price_cents: device.disposal_price_cents ?? null,
            disposal_notes: device.disposal_notes || null,
          })
          .eq('id', device.id)
          .eq('openid', owner),
      )
      throw error
    }
    return { ok: true }
  }

  async function ownerRecords(owner) {
    const [devices, maintenance, warranties] = await Promise.all([
      readAll('devices', owner),
      readAll('maintenance_records', owner),
      readAll('warranties', owner),
    ])
    const live = devices.filter((row) => row.deleted_at == null)
    const ids = new Set(live.map((row) => row.id))
    return {
      devices: live,
      maintenance: maintenance.filter((row) => ids.has(row.device_id)),
      warranties: warranties.filter((row) => ids.has(row.device_id)),
    }
  }

  function attachmentItem(row) {
    return {
      id: row.id,
      name: row.name,
      mimeType: row.mime_type,
      size: Number(row.size_bytes),
      createdAt: row.created_at,
    }
  }

  async function ownedAttachment(owner, id) {
    const rows = await selectRows(
      db.from('device_attachments').select('*').eq('id', id).eq('openid', owner).limit(1),
    )
    if (!rows.length) fail('RESOURCE_NOT_FOUND')
    await getOwnedDevice(owner, rows[0].device_id)
    return rows[0]
  }

  async function uploadAttachment(owner, payload) {
    await getOwnedDevice(owner, payload.deviceId)
    const name = text(payload.name, 128, 'name', true)
    if (/[\\/\x00-\x1f]/.test(name)) fail('VALIDATION_ERROR')
    let file
    try {
      file = decodeAttachment(payload.content, name)
    } catch {
      fail('VALIDATION_ERROR', 'Invalid file or file exceeds 2 MiB')
    }
    const existing = await readAll('device_attachments', owner, 'device_id', payload.deviceId)
    if (existing.length >= 10) fail('VALIDATION_ERROR', 'Attachment limit reached')
    const slot = Array.from({ length: 10 }, (_, index) => index).find(
      (index) => !existing.some((row) => row.slot === index),
    )
    const id = randomUUID()
    const cloudPath = `gearflow-private/${createHash('sha256').update(owner).digest('hex').slice(0, 32)}/${id}.${file.extension}`
    const metadata = await storage.getUploadMetadata({ cloudPath })
    const reservedId =
      metadata.fileID ||
      metadata.fileId ||
      (metadata.data && (metadata.data.fileID || metadata.data.fileId))
    if (typeof reservedId !== 'string') fail('INTERNAL_ERROR', 'File reservation failed')
    const row = {
      id,
      slot,
      openid: owner,
      device_id: payload.deviceId,
      name,
      mime_type: file.mimeType,
      size_bytes: file.bytes.length,
      cloud_path: cloudPath,
      file_id: reservedId,
      status: 'UPLOADING',
      created_at: nowValue(),
    }
    await insertRow('device_attachments', row)
    let uploaded = null
    try {
      uploaded = await storage.uploadFile({ cloudPath, fileContent: file.bytes })
      if (!uploaded || uploaded.fileID !== reservedId) fail('INTERNAL_ERROR')
      await getOwnedDevice(owner, payload.deviceId)
      await updateRows(
        db
          .from('device_attachments')
          .update({ file_id: uploaded.fileID, status: 'READY' })
          .eq('id', id)
          .eq('openid', owner),
      )
    } catch (error) {
      // The file ID is durable before uploading, including ambiguous upload timeouts.
      await updateRows(
        db
          .from('device_attachments')
          .update({ status: 'CLEANUP' })
          .eq('id', id)
          .eq('openid', owner),
      )
      await deleteCloudFile(reservedId)
      await deleteRows(db.from('device_attachments').delete().eq('id', id).eq('openid', owner))
      throw error
    }
    return { item: attachmentItem(row) }
  }

  let configCache = null
  function subscriptionCode(error, fallback = 'OPENAPI_UNAVAILABLE') {
    const raw = error && (error.errCode ?? error.errcode ?? error.code)
    if (
      (typeof raw === 'number' && Number.isSafeInteger(raw)) ||
      (typeof raw === 'string' && /^-?\d{1,9}$/.test(raw))
    )
      return Number(raw)
    return ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'].includes(raw) ? raw : fallback
  }

  async function reminderConfig(useCache = true) {
    if (useCache && configCache && configCache.until > Date.now()) return configCache.value
    let value = null
    try {
      const result = await cloud.openapi.subscribeMessage.getTemplateList({})
      for (const template of result.data || []) {
        value = reminderTemplate(template)
        if (value) break
      }
    } catch (error) {
      const code = subscriptionCode(error)
      console.error(`gearflow-api subscription: ${code}`)
      // Inspect only for fixed known diagnostics; never persist raw SDK messages.
      const messages = [error && error.errMsg, error && error.message].filter(
        (value) => typeof value === 'string',
      )
      return {
        errorCode: code,
        missingWxCloudApiToken: messages.some((value) => /missing wxCloudApiToken/i.test(value)),
      }
    }
    configCache = { until: Date.now() + 60000, value }
    return value
  }

  async function checkSubscriptionApi() {
    const config = await reminderConfig(false)
    return {
      available: !!config && !config.errorCode,
      errorCode: config && config.errorCode ? config.errorCode : config ? null : 'NO_TEMPLATE',
      missingWxCloudApiToken: config?.missingWxCloudApiToken === true,
    }
  }

  const reminderItem = (row) => ({
    id: row.id,
    remindOn: row.remind_on,
    warrantyEnd: row.warranty_end,
    status: row.status,
  })

  function reminderMetadata(row) {
    const previous =
      typeof row.extra_fields === 'string' ? JSON.parse(row.extra_fields) : row.extra_fields
    return Array.isArray(previous) ? { fields: previous } : { ...previous }
  }

  async function createReminder(owner, payload) {
    const device = await getOwnedDevice(owner, payload.deviceId)
    if (
      ['SOLD', 'DISCARDED'].includes(device.status) ||
      !validDate(payload.remindOn) ||
      payload.remindOn <= todayString()
    )
      fail('VALIDATION_ERROR')
    const warranty = await selectRows(
      db.from('warranties').select('*').eq('device_id', device.id).eq('openid', owner).limit(1),
    )
    if (!warranty.length || payload.remindOn > warranty[0].end_date) fail('VALIDATION_ERROR')
    const config = await reminderConfig()
    if (!config || config.errorCode || payload.templateId !== config.templateId)
      fail('VALIDATION_ERROR', 'Template unavailable')
    const previous = await readAll('device_reminders', owner, 'device_id', device.id)
    const pending = previous.find(
      (row) =>
        row.remind_on === payload.remindOn &&
        row.status === 'PENDING' &&
        row.template_id === config.templateId &&
        row.warranty_end === warranty[0].end_date,
    )
    if (pending) return { item: reminderItem(pending) }
    if (
      previous.some(
        (row) =>
          row.remind_on === payload.remindOn &&
          ['PENDING', 'SENDING', 'SENT', 'UNKNOWN'].includes(row.status),
      )
    )
      fail('VALIDATION_ERROR', 'Reminder already exists')
    await cancelReminders(owner, device.id)
    const row = {
      id: randomUUID(),
      openid: owner,
      device_id: device.id,
      remind_on: payload.remindOn,
      warranty_end: warranty[0].end_date,
      template_id: config.templateId,
      device_field: config.device,
      date_field: config.date,
      extra_fields: JSON.stringify({ fields: config.extras, content: config.content }),
      status: 'PENDING',
      created_at: nowValue(),
      updated_at: nowValue(),
    }
    const reusable = previous.find((item) => item.remind_on === payload.remindOn)
    if (reusable) {
      row.id = reusable.id
      await updateRows(db.from('device_reminders').update(row).eq('id', row.id).eq('openid', owner))
    } else await insertRow('device_reminders', row)
    return { item: reminderItem(row) }
  }

  async function noteNativeTimer(flags) {
    const rows = (await readAll('device_reminders', null, 'status', 'PENDING')).filter(
      (row) => row.remind_on <= todayString(),
    )
    for (const row of rows.slice(0, 20)) {
      const metadata = reminderMetadata(row)
      metadata.nativeTimerEntry = {
        checkedAt: nowValue(),
        typeMatches: flags.typeMatches === true,
        nameMatches: flags.nameMatches === true,
        accepted: flags.accepted === true,
      }
      await updateRows(
        db
          .from('device_reminders')
          .update({ extra_fields: JSON.stringify(metadata) })
          .eq('id', row.id)
          .eq('status', 'PENDING'),
      )
    }
  }

  async function sendDue() {
    const rows = (await readAll('device_reminders', null, 'status', 'PENDING')).filter(
      (row) => row.remind_on <= todayString(),
    )
    if (rows.length) {
      const platform = await checkSubscriptionApi()
      if (!platform.available) {
        for (const row of rows.slice(0, 20)) {
          const metadata = reminderMetadata(row)
          metadata.platformCheck = { ...platform, checkedAt: nowValue() }
          await updateRows(
            db
              .from('device_reminders')
              .update({ extra_fields: JSON.stringify(metadata), updated_at: nowValue() })
              .eq('id', row.id)
              .eq('status', 'PENDING'),
          )
        }
        return { sent: 0, blocked: true, errorCode: platform.errorCode }
      }
    }
    let sent = 0
    for (const row of rows.slice(0, 20)) {
      const claimed = await selectRows(
        db
          .from('device_reminders')
          .update({ status: 'SENDING', updated_at: nowValue() })
          .eq('id', row.id)
          .eq('status', 'PENDING')
          .select('id'),
      )
      if (!claimed.length) continue
      let status = 'CANCELLED'
      let errorCode = null
      try {
        await activeOwner(row.openid)
        const device = await getOwnedDevice(row.openid, row.device_id)
        const warranty = await selectRows(
          db
            .from('warranties')
            .select('*')
            .eq('device_id', device.id)
            .eq('openid', row.openid)
            .limit(1),
        )
        if (
          ['SOLD', 'DISCARDED'].includes(device.status) ||
          !warranty.length ||
          warranty[0].end_date !== row.warranty_end
        )
          throw new Error('CANCEL')
        const data = reminderData(row, device.name, nowValue())
        status = 'UNKNOWN'
        const response = await cloud.openapi.subscribeMessage.send({
          touser: row.openid,
          templateId: row.template_id,
          page: `pages/devices/detail?id=${encodeURIComponent(device.id)}`,
          miniprogramState: 'trial',
          data,
        })
        errorCode = subscriptionCode(response, 'UNCONFIRMED_RESPONSE')
        status =
          errorCode === 0
            ? 'SENT'
            : typeof errorCode === 'number' && errorCode !== -1
              ? 'FAILED'
              : 'UNKNOWN'
        if (status === 'SENT') sent += 1
      } catch (error) {
        if (status === 'UNKNOWN') {
          errorCode = subscriptionCode(error)
          // Only documented, definitive platform rejections establish non-delivery.
          if ([-501007, -604101, 43101, 47003, 40037, 40003, 41030].includes(errorCode))
            status = 'FAILED'
        }
      }
      const metadata = reminderMetadata(row)
      metadata.deliveryAttempt = { status, errorCode }
      await updateRows(
        db
          .from('device_reminders')
          .update({ status, extra_fields: JSON.stringify(metadata), updated_at: nowValue() })
          .eq('id', row.id)
          .eq('status', 'SENDING'),
      )
    }
    return { sent }
  }

  async function route(owner, action, payload) {
    await activeOwner(owner)
    switch (action) {
      case 'device.dispose':
        return dispose(owner, payload)
      case 'report.annual': {
        const records = await ownerRecords(owner)
        try {
          return annualReport(payload.year, records.devices, records.maintenance, todayString())
        } catch {
          fail('VALIDATION_ERROR', 'Invalid report year or data')
        }
        break
      }
      case 'export.json': {
        const records = await ownerRecords(owner)
        const stripOwner = (row) => {
          const { userId, ...rest } = row
          return rest
        }
        return {
          format: 'gearflow',
          version: 1,
          exportedAt: new Date().toISOString(),
          devices: records.devices.map((row) => stripOwner(mapDevice(row))),
          warranties: records.warranties.map((row) => stripOwner(mapWarranty(row))),
          maintenances: records.maintenance.map((row) => stripOwner(mapMaintenance(row))),
        }
      }
      case 'attachment.list': {
        await getOwnedDevice(owner, payload.deviceId)
        return {
          items: (await readAll('device_attachments', owner, 'device_id', payload.deviceId))
            .filter((row) => row.status === 'READY')
            .map(attachmentItem),
        }
      }
      case 'attachment.upload':
        return uploadAttachment(owner, payload)
      case 'attachment.open': {
        const row = await ownedAttachment(owner, payload.id)
        if (row.status !== 'READY') fail('RESOURCE_NOT_FOUND')
        const result = await storage.downloadFile({ fileID: row.file_id })
        if (
          !Buffer.isBuffer(result.fileContent) ||
          result.fileContent.length !== Number(row.size_bytes) ||
          result.fileContent.length > 2 * 1024 * 1024
        )
          fail('INTERNAL_ERROR', 'Invalid file content')
        return { content: result.fileContent.toString('base64'), mimeType: row.mime_type }
      }
      case 'attachment.delete': {
        const row = await ownedAttachment(owner, payload.id)
        if (
          row.status === 'UPLOADING' &&
          Date.now() - Date.parse(`${String(row.created_at).replace(' ', 'T')}Z`) < 120000
        )
          fail('RATE_LIMITED')
        if (row.file_id) await deleteCloudFile(row.file_id)
        await deleteRows(
          db.from('device_attachments').delete().eq('id', row.id).eq('openid', owner),
        )
        return { ok: true }
      }
      case 'reminder.config': {
        const config = await reminderConfig()
        return {
          available: !!config && !config.errorCode,
          templateId: config && !config.errorCode ? config.templateId : null,
          reason:
            config && config.errorCode ? 'PLATFORM_UNAVAILABLE' : config ? null : 'NO_TEMPLATE',
          reasonCode: config && config.errorCode ? config.errorCode : null,
        }
      }
      case 'reminder.list': {
        await getOwnedDevice(owner, payload.deviceId)
        return {
          items: (await readAll('device_reminders', owner, 'device_id', payload.deviceId)).map(
            reminderItem,
          ),
        }
      }
      case 'reminder.create':
        return createReminder(owner, payload)
      case 'reminder.cancel': {
        await updateRows(
          db
            .from('device_reminders')
            .update({ status: 'CANCELLED', updated_at: nowValue() })
            .eq('id', payload.id)
            .eq('openid', owner)
            .eq('status', 'PENDING'),
        )
        return { ok: true }
      }
      default:
        fail('VALIDATION_ERROR', 'Unknown action')
    }
  }
  return {
    route,
    cleanupAttachments,
    cancelReminders,
    sendDue,
    checkSubscriptionApi,
    noteNativeTimer,
  }
}
