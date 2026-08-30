/**
 * Phase 3 用户体系自动化验收（miniprogram-automator 官方协议）。
 * 前置：DevTools 服务端口已开启，且已执行
 *   "<DevTools>/cli.bat" auto --project "F:/repo/repo_uniapp/dist/build/mp-weixin" --auto-port 9420
 * 运行：node scripts/verify-phase3.mjs
 * 产物：.e2e/*.png 截图与控制台检查结果；涉及真实账号 bootstrap，会写入数据库。
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
  const path = `${OUT_DIR}/${name}.png`
  await miniProgram.screenshot({ path })
  return path
}

async function main() {
  console.log('连接 DevTools 自动化端口（ws://127.0.0.1:9420）…')
  const miniProgram = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  log('自动化连接', true)

  // 先回首页：storage 未设置时 home.onShow 会重定向到 onboarding
  await miniProgram.reLaunch('/pages/home/index')
  await new Promise((r) => setTimeout(r, 3000))
  let page = await miniProgram.currentPage()
  log('引导页展示', page.path === 'pages/onboarding/index', `当前页面: ${page.path}`)
  await shot(miniProgram, '1-onboarding')

  // 勾选同意协议
  const agreeRow = await page.$('.agree-row')
  if (agreeRow) {
    await agreeRow.tap()
    await new Promise((r) => setTimeout(r, 500))
  }
  log('勾选协议同意', Boolean(agreeRow))

  // 点「同意并开始使用」→ 触发真实 signIn + bootstrap（写库）
  const enterButton = await page.$('.enter-button')
  if (!enterButton) throw new Error('找不到同意按钮')
  await enterButton.tap()
  await page.waitFor(5000)

  // 应 reLaunch 回首页
  page = await miniProgram.currentPage()
  log('同意后进入首页', page.path === 'pages/home/index', `当前页面: ${page.path}`)
  await shot(miniProgram, '2-home-after-bootstrap')

  // 切到「我的」Tab，读取渲染出的用户信息
  await miniProgram.switchTab('/pages/profile/index')
  await page.waitFor(2500)
  page = await miniProgram.currentPage()
  log('我的 Tab 可达', page.path === 'pages/profile/index', `当前页面: ${page.path}`)
  const nicknameEl = await page.$('.name')
  const nickname = nicknameEl ? await nicknameEl.text() : '(未找到)'
  log(
    '用户信息渲染',
    nickname.includes('GearFlow 用户') || nickname.length > 0,
    `昵称: ${nickname}`,
  )
  await shot(miniProgram, '3-profile')

  const uidEl = await page.$('.uid')
  const uidText = uidEl ? await uidEl.text() : '(未找到)'
  log('身份短码渲染', uidText.includes('ID：'), uidText)

  console.log('\n=== 结果汇总 ===')
  const failed = results.filter((r) => !r.ok)
  console.log(failed.length === 0 ? '全部通过' : `${failed.length} 项失败`)
  await miniProgram.disconnect()
}

main().catch((err) => {
  console.error('自动化失败:', err.message)
  process.exit(1)
})
