/**
 * Phase 7 维护记录自动化冒烟验收。
 * 前置：cli auto（9420）已启动；已以真实用户身份预插设备（id 作参数传入）。
 * 运行：node scripts/verify-phase7.mjs <deviceId>
 * 流程：详情页 → 添加维护记录（表单填标题+费用）→ 保存 → 详情显示记录+时间线+小计 → 清理由外部完成。
 */
import automator from 'miniprogram-automator'
import { mkdirSync } from 'node:fs'

const OUT_DIR = 'F:/repo/repo_uniapp/.e2e'
const DEVICE_ID = process.argv[2] ?? ''

mkdirSync(OUT_DIR, { recursive: true })

if (!DEVICE_ID) {
  console.error('用法：node scripts/verify-phase7.mjs <deviceId>')
  process.exit(1)
}

const results = []
function log(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`)
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function findByText(page, tag, text) {
  const elements = await page.$$(tag)
  for (const el of elements) {
    if ((await el.text()) === text) return el
  }
  return null
}

async function main() {
  const miniProgram = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  log('自动化连接', true)

  await miniProgram.navigateTo('/pages/devices/detail?id=' + DEVICE_ID)
  await wait(4000)
  let page = await miniProgram.currentPage()
  log('详情页可达', page.path === 'pages/devices/detail', page.path)

  // 点「+ 添加」进入维护表单
  const addBtn = await findByText(page, 'button', '+ 添加')
  if (!addBtn) throw new Error('找不到「+ 添加」按钮')
  await miniProgram.navigateTo('/pages/devices/maintenance?deviceId=' + DEVICE_ID)
  await wait(2000)
  page = await miniProgram.currentPage()
  log('维护表单可达', page.path === 'pages/devices/maintenance', page.path)
  await miniProgram.screenshot({ path: `${OUT_DIR}/phase7-1-form.png` })

  // 填标题与费用（tag+text 不可用于 input，按顺序：标题、费用；品牌等无——此页只有标题/费用/服务商三个 input）
  const inputs = await page.$$('.input')
  if (inputs.length < 2) throw new Error(`输入框数量异常: ${inputs.length}`)
  await inputs[0].input('更换电池（自动化）')
  await inputs[1].input('500')
  log('填写表单', true)

  const saveButton = await findByText(page, 'button', '保存')
  if (!saveButton) throw new Error('找不到保存按钮')
  await saveButton.trigger('tap')
  await wait(2500)
  page = await miniProgram.currentPage()
  log('保存后返回详情', page.path === 'pages/devices/detail', page.path)
  await wait(1500)

  // 详情应显示维护记录条目与小计
  const recordTitle = await findByText(page, 'text', '更换电池（自动化）')
  log('维护记录条目渲染', Boolean(recordTitle))
  const texts = await page.$('text')
  let subtotalEl = null
  for (const t of texts) {
    if ((await t.text()).includes('维护支出合计')) subtotalEl = t
  }
  log('维护支出小计渲染', Boolean(subtotalEl))
  await miniProgram.screenshot({ path: `${OUT_DIR}/phase7-2-detail-with-maintenance.png` })

  console.log('\n=== 结果汇总 ===')
  const failed = results.filter((r) => !r.ok)
  console.log(failed.length === 0 ? '全部通过' : `${failed.length} 项失败`)
  await miniProgram.disconnect()
}

main().catch((err) => {
  console.error('自动化失败:', err.message)
  process.exit(1)
})
