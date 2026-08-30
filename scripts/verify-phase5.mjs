/**
 * Phase 5 设备详情自动化冒烟验收。
 * 前置：DevTools 服务端口开启 + cli auto（--auto-port 9420）已启动；
 *       且已用其他方式（如 MCP）以真实用户身份预插验收设备。
 * 运行：node scripts/verify-phase5.mjs <deviceId>
 * 产物：.e2e/phase5-*.png。脚本只做 UI 自动化，不直接操作数据库（Windows shell 引号问题）。
 */
import automator from 'miniprogram-automator'
import { mkdirSync } from 'node:fs'

const OUT_DIR = 'F:/repo/repo_uniapp/.e2e'
const DEVICE_ID = process.argv[2] ?? ''
const DEVICE_NAME = 'Phase5验收设备'
const DEVICE_PRICE = '¥12999.00'

mkdirSync(OUT_DIR, { recursive: true })

if (!DEVICE_ID) {
  console.error('用法：node scripts/verify-phase5.mjs <deviceId>')
  process.exit(1)
}

const results = []
function log(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`)
}

async function shot(miniProgram, name) {
  await miniProgram.screenshot({ path: `${OUT_DIR}/${name}.png` })
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

  await miniProgram.reLaunch('/pages/devices/index')
  await wait(4000)
  let page = await miniProgram.currentPage()
  log('设备列表可达', page.path === 'pages/devices/index', page.path)

  let deviceEntry = null
  for (let i = 0; i < 10; i += 1) {
    deviceEntry = await findByText(page, 'text', DEVICE_NAME)
    if (deviceEntry) break
    await wait(1000)
  }
  log('验收设备出现在列表', Boolean(deviceEntry))
  await shot(miniProgram, 'phase5-1-list')

  await miniProgram.navigateTo('/pages/devices/detail?id=' + DEVICE_ID)
  await wait(2500)
  page = await miniProgram.currentPage()
  log('详情页可达', page.path === 'pages/devices/detail', page.path)

  // 断言各区块渲染（字段值 + 占位区块 + 操作入口）
  const checks = [
    DEVICE_NAME,
    '基础信息',
    '购买信息',
    'Acme',
    'X1',
    DEVICE_PRICE,
    '2026-01-15',
    '保修信息',
    '维护记录',
    '时间线',
  ]
  for (const text of checks) {
    const el = await findByText(page, 'text', text)
    log(`详情渲染：${text}`, Boolean(el))
  }
  // 操作入口是 button 元素（非 text 组件），单独按 button 查
  const editBtn = await findByText(page, 'button', '编辑')
  log('详情渲染：编辑', Boolean(editBtn))
  const deleteBtn = await findByText(page, 'button', '删除设备')
  log('详情渲染：删除设备', Boolean(deleteBtn))
  await shot(miniProgram, 'phase5-2-detail')

  console.log('\n=== 结果汇总 ===')
  const failed = results.filter((r) => !r.ok)
  console.log(failed.length === 0 ? '全部通过' : `${failed.length} 项失败`)
  await miniProgram.disconnect()
}

main().catch((err) => {
  console.error('自动化失败:', err.message)
  process.exit(1)
})
