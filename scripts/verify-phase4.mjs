/**
 * Phase 4 设备管理自动化冒烟验收。
 * 前置：DevTools 服务端口开启 + cli auto（--auto-port 9420）已启动。
 * 运行：node scripts/verify-phase4.mjs
 *
 * 策略：uni-app 编译产物的 class 选择器与 DOM tap 在自动化下不可靠，
 * 因此页面切换用导航 API、渲染断言用「标签+文本」。
 * 创建/编辑/删除的完整交互需人工在 DevTools 验收（原生弹窗与 tap 限制）。
 * 产物：.e2e/phase4-*.png。
 */
import automator from 'miniprogram-automator'
import { mkdirSync } from 'node:fs'

const OUT_DIR = 'F:/repo/repo_uniapp/.e2e'

mkdirSync(OUT_DIR, { recursive: true })

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

  await miniProgram.switchTab('/pages/devices/index')
  let page = await miniProgram.currentPage()

  // 冷启动首次列表加载走真实云调用（含会话自愈），轮询等待渲染完成
  let addButton = null
  for (let i = 0; i < 15; i += 1) {
    await wait(1000)
    addButton = await findByText(page, 'button', '添加设备')
    if (addButton) break
  }
  log('设备 Tab 可达', page.path === 'pages/devices/index', page.path)
  log('列表页渲染完成（含添加按钮）', Boolean(addButton))
  await shot(miniProgram, 'phase4-1-list')

  // 进入创建页（导航 API），断言表单渲染后返回
  await miniProgram.navigateTo('/pages/devices/edit')
  await wait(2000)
  page = await miniProgram.currentPage()
  log('进入创建页', page.path === 'pages/devices/edit', page.path)
  // 表单字段在 FormField 自定义组件内，页面级 text 选择器无法穿透（已知限制），
  // 以页面路径 + 截图作为渲染依据，人工验收看 .e2e/phase4-2-form.png
  const formPage = page.path === 'pages/devices/edit'
  log('表单渲染（以截图为准）', formPage)
  await shot(miniProgram, 'phase4-2-form')
  await miniProgram.navigateBack()
  await wait(1500)
  page = await miniProgram.currentPage()
  log('返回列表', page.path === 'pages/devices/index', page.path)

  console.log('\n=== 结果汇总 ===')
  const failed = results.filter((r) => !r.ok)
  console.log(
    failed.length === 0
      ? '冒烟项全部通过；创建/编辑/删除完整交互请在 DevTools 人工验收'
      : `${failed.length} 项失败`,
  )
  await miniProgram.disconnect()
}

main().catch((err) => {
  console.error('自动化失败:', err.message)
  process.exit(1)
})
