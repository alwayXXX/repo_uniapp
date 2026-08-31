/**
 * Phase 6 设备时间线自动化冒烟验收。
 * 前置：DevTools 服务端口开启 + cli auto（--auto-port 9420）已启动；
 *       且已以真实用户身份准备好一台「创建时带购买日期、随后改过名」的验收设备。
 * 运行：node scripts/verify-phase6.mjs <deviceId>
 * 产物：.e2e/phase6-*.png。
 *
 * 已知限制：时间线条目渲染在 DeviceTimelineList 自定义组件内部，automator 的
 * 页面级元素查询无法穿透组件边界，因此事件条目以截图为验收依据（DB 侧数据
 * 与触发器行为由服务端验证矩阵覆盖）。
 */
import automator from 'miniprogram-automator'
import { mkdirSync } from 'node:fs'

const OUT_DIR = 'F:/repo/repo_uniapp/.e2e'
const DEVICE_ID = process.argv[2] ?? ''

mkdirSync(OUT_DIR, { recursive: true })

if (!DEVICE_ID) {
  console.error('用法：node scripts/verify-phase6.mjs <deviceId>')
  process.exit(1)
}

const results = []
function log(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`)
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function findByText(page, tag, expected) {
  const elements = await page.$$(tag)
  for (const element of elements) {
    if ((await element.text()) === expected) return element
  }
  return null
}

async function main() {
  const miniProgram = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  log('自动化连接', true)

  await miniProgram.navigateTo('/pages/devices/detail?id=' + DEVICE_ID)
  // 时间线由客户端异步拉取，等待渲染稳定后截图
  await wait(6000)

  const page = await miniProgram.currentPage()
  log('详情页可达', page.path === 'pages/devices/detail', page.path)

  // 页面级断言（组件外的文本）
  log('渲染：时间线区块标题', Boolean(await findByText(page, 'text', '时间线')))
  await miniProgram.screenshot({ path: `${OUT_DIR}/phase6-detail.png` })

  // 截屏后向上滚动到时间线区块再截一张（时间线位于页面底部）
  await miniProgram.pageScrollTo(2000)
  await wait(1200)
  await miniProgram.screenshot({ path: `${OUT_DIR}/phase6-detail-timeline.png` })

  console.log('\n=== 结果汇总 ===')
  console.log('页面级断言见上；时间线事件条目请查看 .e2e/phase6-detail-timeline.png 人工核对')
  await miniProgram.disconnect()
}

main().catch((error) => {
  console.error('自动化失败:', error.message)
  process.exit(1)
})
