/**
 * Phase 8 数据统计自动化冒烟验收。
 * 前置：执行 `pnpm build:mp-weixin`，并启动 DevTools auto（--auto-port 9420）。
 * 运行：node scripts/verify-phase8.mjs
 * 产物：.e2e/phase8-*.png。
 *
 * 自动化只覆盖页面可达、核心区块、范围/分类控件和金额展示信号；
 * picker 的原生选项与分类下钻请在 DevTools 中人工确认。
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function findByText(page, tag, expected) {
  const elements = await page.$$(tag)
  for (const element of elements) {
    const value = await element.text()
    if (typeof expected === 'string' ? value === expected : expected.test(value)) return element
  }
  return null
}

async function collectText(page) {
  const elements = await page.$$('text')
  const values = []
  for (const element of elements) values.push(await element.text())
  return values
}

async function main() {
  console.log('连接 DevTools 自动化端口（ws://127.0.0.1:9420）…')
  const miniProgram = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  log('自动化连接', true)

  await miniProgram.switchTab('/pages/stats/index')
  let page = await miniProgram.currentPage()
  log('数据 Tab 可达', page.path === 'pages/stats/index', `当前页面: ${page.path}`)

  let ready = false
  for (let i = 0; i < 15; i += 1) {
    await wait(1000)
    page = await miniProgram.currentPage()
    const texts = await collectText(page)
    if (texts.includes('当前资产') || texts.includes('还没有可分析的数据')) {
      ready = true
      break
    }
  }
  log('统计页加载完成', ready)

  const pickers = await page.$$('picker')
  log('范围与分类控件渲染', pickers.length >= 2, `picker 数量: ${pickers.length}`)

  const expectedSections = [
    '数据',
    '范围',
    '分类',
    '购买支出',
    '维护支出',
    '生命周期',
    '分类资产',
    '保修状态',
  ]
  const texts = await collectText(page)
  for (const expected of expectedSections) {
    log(`统计区块：${expected}`, texts.includes(expected))
  }

  const empty = await findByText(page, 'text', '还没有可分析的数据')
  if (empty) {
    log('空状态渲染', true)
  } else {
    const asset = await findByText(page, 'text', '当前资产')
    log('资产汇总渲染', Boolean(asset))
    const formattedMoney = await findByText(
      page,
      'text',
      /(?:¥|\$|€|£|NT\$|₩|[A-Z]{3} )\d[\d,]*\.\d{2}|—/,
    )
    log('金额格式化信号', Boolean(formattedMoney))
  }

  await miniProgram.screenshot({ path: `${OUT_DIR}/phase8-stats-top.png` })
  await miniProgram.pageScrollTo(1800)
  await wait(800)
  await miniProgram.screenshot({ path: `${OUT_DIR}/phase8-stats-bottom.png` })

  console.log('\n=== 结果汇总 ===')
  const failed = results.filter((result) => !result.ok)
  console.log(
    failed.length === 0
      ? '页面冒烟全部通过；范围切换、分类下钻和空数据账号请在 DevTools 人工确认'
      : `${failed.length} 项失败`,
  )
  await miniProgram.disconnect()
  if (failed.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error('自动化失败:', error.message)
  process.exit(1)
})
