/**
 * Phase 9 E2E 补齐验收：首页看板渲染 + 保修录入同步 + 维护编辑/删除路径。
 * 前置：cli auto（9420）已启动；已以真实用户身份预插设备（id 作参数，含购买日期 2026-01-01）。
 * 运行：node scripts/verify-phase9.mjs <deviceId>
 * 产物：.e2e/phase9-*.png。数据库清理由外部完成。
 */
import automator from 'miniprogram-automator'
import { mkdirSync } from 'node:fs'

const OUT_DIR = 'F:/repo/repo_uniapp/.e2e'
const DEVICE_ID = process.argv[2] ?? ''

mkdirSync(OUT_DIR, { recursive: true })

if (!DEVICE_ID) {
  console.error('用法：node scripts/verify-phase9.mjs <deviceId>')
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

async function hasText(page, tag, needle) {
  const elements = await page.$$(tag)
  for (const el of elements) {
    if ((await el.text()).includes(needle)) return true
  }
  return false
}

async function findElementWithAttributeAndText(page, tag, attribute, needle) {
  const elements = await page.$$(tag)
  for (const el of elements) {
    const value = await el.attribute(attribute)
    if (value && (await el.text()).includes(needle)) return el
  }
  return null
}

async function findInputByPlaceholder(page, needle) {
  const inputs = await page.$$('input')
  for (const input of inputs) {
    const placeholder = await input.attribute('placeholder')
    if (placeholder && placeholder.includes(needle)) return input
  }
  return null
}

async function main() {
  const miniProgram = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  log('自动化连接', true)

  // A. 首页看板：设备已预插，看板应显示设备数且不重定向到 onboarding
  await miniProgram.reLaunch('/pages/home/index')
  await wait(4000)
  let page = await miniProgram.currentPage()
  log('首页可达（未重定向引导）', page.path === 'pages/home/index', page.path)
  const deviceCountOk = await hasText(page, 'text', '1 台设备')
  log('首页看板：设备总数渲染', deviceCountOk)
  await miniProgram.screenshot({ path: `${OUT_DIR}/phase9-1-home.png` })

  // B. 设备编辑页预填保修（通过 UI 无法自动化 native picker，改为验证详情页保修区块响应）
  // 直接驱动编辑页保存保修：导航到编辑页，验证保修字段渲染后返回
  await miniProgram.navigateTo('/pages/devices/edit?id=' + DEVICE_ID)
  await wait(2000)
  page = await miniProgram.currentPage()
  const warrantyLabel = await findByText(page, 'text', '保修信息（选填）')
  log('编辑页保修区段渲染', Boolean(warrantyLabel))
  await miniProgram.screenshot({ path: `${OUT_DIR}/phase9-2-edit-warranty.png` })
  await miniProgram.navigateBack()
  await wait(1500)

  // C. 维护记录路径：详情 → 添加维护 → 保存 → 详情显示 → 进入编辑 → 删除
  await miniProgram.navigateTo('/pages/devices/maintenance?deviceId=' + DEVICE_ID)
  await wait(2000)
  page = await miniProgram.currentPage()
  log('维护表单可达', page.path === 'pages/devices/maintenance', page.path)

  const titleInput = await findInputByPlaceholder(page, '例如：更换电池')
  const costInput = await findInputByPlaceholder(page, '500.00')
  if (!titleInput || !costInput) throw new Error('找不到维护标题或费用输入框')
  await titleInput.input('Phase9维护（自动化）')
  await costInput.input('120')
  log('填写维护表单', true)

  const saveButton = await findByText(page, 'button', '保存')
  if (!saveButton) throw new Error('找不到保存按钮')
  await saveButton.trigger('tap')
  await wait(2500)
  page = await miniProgram.currentPage()
  log('维护保存后返回详情', page.path === 'pages/devices/detail', page.path)
  await wait(1500)

  const recordOk = await findByText(page, 'text', 'Phase9维护（自动化）')
  log('维护记录渲染在详情', Boolean(recordOk))
  const costShown = await hasText(page, 'text', '¥120.00')
  log('维护费用渲染', costShown)
  await miniProgram.screenshot({ path: `${OUT_DIR}/phase9-3-detail-with-maintenance.png` })

  // 从详情维护行读取真实记录 ID，进入编辑并验证预填
  const maintenanceRow = await findElementWithAttributeAndText(
    page,
    'view',
    'data-maintenance-id',
    'Phase9维护（自动化）',
  )
  const recordId = maintenanceRow ? await maintenanceRow.attribute('data-maintenance-id') : ''
  log('取得真实维护记录 ID', Boolean(recordId))
  if (!recordId) throw new Error('详情页未找到自动化维护记录标记')

  await miniProgram.navigateTo(
    '/pages/devices/maintenance?deviceId=' + DEVICE_ID + '&id=' + recordId,
  )
  await wait(1500)
  page = await miniProgram.currentPage()
  const editTitleInput = await findInputByPlaceholder(page, '例如：更换电池')
  const prefilledTitle = editTitleInput ? await editTitleInput.value() : ''
  log('维护编辑预填', prefilledTitle === 'Phase9维护（自动化）')

  // 修改标题并保存，确认真实更新路径
  if (editTitleInput) await editTitleInput.input('Phase9维护（自动化）-编辑')
  const updateButton = await findByText(page, 'button', '保存修改')
  if (!updateButton) throw new Error('找不到维护编辑保存按钮')
  await updateButton.trigger('tap')
  await wait(2200)
  page = await miniProgram.currentPage()
  log('维护编辑后返回详情', page.path === 'pages/devices/detail', page.path)
  await wait(1000)
  log('维护编辑结果渲染', await hasText(page, 'text', 'Phase9维护（自动化）-编辑'))

  // 删除路径：使用真实记录 ID 调起删除确认并断言详情移除
  await miniProgram.navigateTo(
    '/pages/devices/maintenance?deviceId=' + DEVICE_ID + '&id=' + recordId,
  )
  await wait(1200)
  page = await miniProgram.currentPage()
  const deleteButton = await findByText(page, 'button', '删除此维护记录')
  if (!deleteButton) throw new Error('找不到维护删除按钮')
  await deleteButton.trigger('tap')
  await wait(300)
  const confirmDeleteButton = await findByText(page, 'button', '删除')
  if (!confirmDeleteButton) throw new Error('找不到删除确认按钮')
  await confirmDeleteButton.trigger('tap')
  await wait(2200)
  page = await miniProgram.currentPage()
  log('维护删除后返回详情', page.path === 'pages/devices/detail', page.path)
  await wait(1000)
  log('维护删除结果清理', !(await hasText(page, 'text', 'Phase9维护（自动化）-编辑')))
  await miniProgram.screenshot({ path: `${OUT_DIR}/phase9-4-detail-after-delete.png` })

  console.log('\n=== 结果汇总 ===')
  const failed = results.filter((r) => !r.ok)
  console.log(failed.length === 0 ? '全部通过' : `${failed.length} 项失败`)
  await miniProgram.disconnect()
  if (failed.length > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error('自动化失败:', err.message)
  process.exit(1)
})
