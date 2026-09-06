/**
 * ai-annual-report：GearFlow AI 年度设备报告（Phase 12 第一slice）。
 * 客户端经 RLS 拉取自己的统计数据后 POST 到本函数，本函数仅负责
 * 组装中文 prompt 并调用混元模型生成叙事报告。不接触序列号等敏感字段。
 * 模型走 hunyuan-v3 组（成长计划混元额度池）。
 */
const tcb = require('@cloudbase/node-sdk')

let app
let aiModel

function getModel() {
  if (!aiModel) {
    app = app || tcb.init({ env: process.env.TCB_ENV })
    aiModel = app.ai().createModel('hunyuan-v3')
  }
  return aiModel
}

function buildPrompt(payload) {
  const { year, stats } = payload
  return [
    `你是个人数码设备资产管理助手。请根据用户 ${year} 年的设备台账统计数据，写一份中文年度设备报告。`,
    '要求：1) 用友好的第二人称叙述；2) 包含三个部分：资产总览（设备数与总投入）、使用与维护亮点（维修次数最多的设备、保修状态）、明年建议（保养/换新时机）；3) 300-500 字；4) 不要编造数据中不存在的设备或金额。',
    '',
    `统计数据（JSON）：`,
    JSON.stringify(stats),
  ].join('\n')
}

function summarizeDevices(devices) {
  return (devices || []).map((d) => ({
    分类: d.categoryName || d.category || '',
    名称: d.name || '',
    购买日期: d.purchaseDate || '',
    价格元: d.purchasePriceYuan ?? null,
    状态: d.status || '',
    维修次数: d.maintenanceCount ?? 0,
    维修花费元: d.maintenanceTotalYuan ?? 0,
    保修状态: d.warrantyState || '未知',
  }))
}

exports.main = async (event) => {
  let payload = event
  if (typeof event?.body === 'string') {
    try {
      payload = JSON.parse(event.body)
    } catch {
      payload = {}
    }
  }
  const year = Number(payload?.year) || new Date().getFullYear()
  const stats = payload?.stats
  if (!stats || typeof stats !== 'object') {
    return { ok: false, errorCode: 'VALIDATION_ERROR' }
  }
  try {
    const model = getModel()
    const result = await model.generateText({
      model: 'hy3-preview',
      messages: [
        { role: 'system', content: '你是严谨的个人资产管理助手，只依据给定数据作答。' },
        { role: 'user', content: buildPrompt({ year, stats }) },
      ],
    })
    const usage = result && result.usage ? { totalTokens: result.usage.total_tokens } : {}
    const text =
      (result &&
        (result.text ||
          (result.choices &&
            result.choices[0] &&
            result.choices[0].message &&
            result.choices[0].message.content))) ||
      ''
    if (!text) {
      return { ok: false, errorCode: 'EMPTY_GENERATION' }
    }
    return { ok: true, year, report: text, usage }
  } catch (e) {
    // 调试阶段回传模型调用失败详情（定位 Phase 12 后移除）
    const detail = e && e.message ? String(e.message).slice(0, 200) : 'unknown'
    console.log('ai-annual-report failed:', detail)
    return { ok: false, errorCode: 'AI_CALL_FAILED', debug: detail }
  }
}
