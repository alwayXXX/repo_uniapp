/**
 * 登录通道探针：清空模拟器存储后强制走一次全新 signInWithOpenId（当前代码的默认链路），
 * 验证身份签发是否可用。用于授权关系变更后的登录链路回归（见 BACKLOG OPS-7）。
 * 前置：DevTools 已以自动化模式打开项目（cli auto --auto-port 9420）。
 * 运行：node scripts/check-login-channel.mjs
 */
import automator from 'miniprogram-automator'
import { mkdirSync } from 'node:fs'

const OUT_DIR = 'F:/repo/repo_uniapp/.e2e'
mkdirSync(OUT_DIR, { recursive: true })

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const miniProgram = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  console.log('✅ 已连接自动化端口')

  // 清空存储：抹掉旧会话与 onboarding 标记，强制全新登录
  await miniProgram.callWxMethod('clearStorageSync')
  console.log('✅ 已清空模拟器存储')

  await miniProgram.reLaunch('/pages/home/index')
  await wait(2500)
  let page = await miniProgram.currentPage()
  console.log(`当前页面: ${page.path}（预期 onboarding）`)

  const agreeRow = await page.$('.agree-row')
  if (agreeRow) {
    await agreeRow.tap()
    await wait(500)
  }
  const enterButton = await page.$('.enter-button')
  if (!enterButton) throw new Error('找不到同意按钮')
  await enterButton.tap()
  console.log('⏳ 已触发同意并开始使用，等待全新 signInWithOpenId …')
  await wait(8000)

  page = await miniProgram.currentPage()
  const landedHome = page.path === 'pages/home/index'
  console.log(`${landedHome ? '✅' : '❌'} 登录后落地页: ${page.path}（预期 pages/home/index）`)

  // 存储里出现 CloudBase 会话键 = 签发成功
  const info = await miniProgram.callWxMethod('getStorageInfoSync')
  const keys = (info && info.keys) || []
  const sessionKeys = keys.filter((k) => /cloudbase|tcb|tcb_/.test(String(k).toLowerCase()))
  console.log(
    `${sessionKeys.length > 0 ? '✅' : '❌'} 会话存储键: ${sessionKeys.join(', ') || '(无)'}`,
  )

  await miniProgram.screenshot({ path: `${OUT_DIR}/login-channel-probe.png` })
  console.log('📸 截图: .e2e/login-channel-probe.png')

  const pass = landedHome && sessionKeys.length > 0
  console.log(pass ? '=== 结论：登录链路可用 ===' : '=== 结论：登录链路不可用 ===')
  await miniProgram.disconnect()
  process.exit(pass ? 0 : 1)
}

main().catch((err) => {
  console.error('❌ 探针异常:', err.message)
  process.exit(2)
})
