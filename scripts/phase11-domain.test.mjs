import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { timerVariables } from './configure-reminder-timer.mjs'
const {
  annualReport,
  decodeAttachment,
  validDate,
  reminderTemplate,
  reminderData,
  isTimerInvocation,
} = createRequire(import.meta.url)('../cloudfunctions/gearflow-api/phase11-domain.js')

test('annual dates respect leap years and exclude future dates', () => {
  assert.equal(validDate('2024-02-29'), true)
  assert.equal(validDate('2026-02-29'), false)
  const report = annualReport(
    2026,
    [{ id: 'device', status: 'IN_USE', purchase_date: '2026-12-31', purchase_price_cents: 200 }],
    [],
    '2026-10-27',
  )
  assert.equal(report.purchaseCount, 0)
})
test('annual report uses maintenance records once, handles null amounts and negative net spend', () => {
  const report = annualReport(
    2026,
    [
      {
        id: 'device',
        status: 'SOLD',
        purchase_date: '2026-01-01',
        purchase_price_cents: null,
        disposal_date: '2026-02-01',
        disposal_price_cents: 1000,
      },
    ],
    [
      { device_id: 'device', occurred_at: '2026-02-28', cost_cents: 200 },
      { device_id: 'other', occurred_at: '2026-02-28', cost_cents: 9000 },
    ],
    '2026-10-27',
  )
  assert.equal(report.maintenanceCents, 200)
  assert.equal(report.netSpendCents, -800)
  assert.equal(report.months[1].disposalIncomeCents, 1000)
})
test('invalid persisted money and mixed currency cannot produce misleading totals', () => {
  for (const overrides of [
    { purchase_price_cents: -1 },
    { purchase_price_cents: 'bad' },
    { currency: 'USD' },
  ])
    assert.throws(() =>
      annualReport(
        2026,
        [{ id: 'device', status: 'IN_USE', purchase_date: '2026-01-01', ...overrides }],
        [],
        '2026-10-27',
      ),
    )
})
test('large base64 validation is bounded and rejects mismatched file extensions', () => {
  const bytes = Buffer.alloc(2 * 1024 * 1024)
  Buffer.from('%PDF-1.7').copy(bytes)
  assert.equal(decodeAttachment(bytes.toString('base64'), 'receipt.pdf').bytes.length, bytes.length)
  assert.throws(() => decodeAttachment(bytes.toString('base64'), 'receipt.png'))
  assert.throws(() => decodeAttachment('AAAA===', 'receipt.pdf'))
})

const todoTemplate = {
  priTmplId: 'synthetic-todo-template',
  type: 2,
  title: '待办事项提醒',
  content: '提醒内容：{{thing2.DATA}}\n到期日期：{{time3.DATA}}\n提醒时间：{{time16.DATA}}',
}

test('maps the selected todo template by label and preserves its real field numbers', () => {
  assert.deepEqual(reminderTemplate(todoTemplate), {
    templateId: 'synthetic-todo-template',
    device: 'thing2',
    date: 'time3',
    extras: ['time16'],
    content: true,
  })
  const data = reminderData(
    {
      device_field: 'thing2',
      date_field: 'time3',
      warranty_end: '2026-12-31',
      extra_fields: { fields: ['time16'], content: true },
    },
    '示例设备',
    '2026-10-27 16:45:00.000',
  )
  assert.deepEqual(data, {
    thing2: { value: '示例设备保修即将到期' },
    time3: { value: '2026-12-31 23:59' },
    time16: { value: '2026-10-28 00:45' },
  })
})

test('preserves old reminder JSON arrays and date fields without adding content text', () => {
  assert.deepEqual(
    reminderData(
      {
        device_field: 'thing1',
        date_field: 'date2',
        warranty_end: '2026-12-31',
        extra_fields: '["thing4","phrase5"]',
      },
      'Legacy device',
      '2026-10-27 01:00:00.000',
    ),
    {
      thing1: { value: 'Legacy device' },
      date2: { value: '2026-12-31' },
      thing4: { value: '请及时查看设备保修状态' },
      phrase5: { value: '保修提醒' },
    },
  )
  const data = reminderData(
    {
      device_field: 'thing2',
      date_field: 'date3',
      warranty_end: '2026-12-31',
      extra_fields: JSON.stringify({ fields: [], content: true }),
    },
    '📱'.repeat(30),
    '2026-10-27 01:00:00.000',
  )
  assert.equal([...data.thing2.value].length, 20)
  assert.ok(data.thing2.value.endsWith('保修即将到期'))
})

test('rejects unrelated, long-term, duplicate or semantically unknown template fields', () => {
  for (const change of [
    { type: 3 },
    { title: '商品发货通知' },
    { content: `${todoTemplate.content}\n支付时间{{time8.DATA}}` },
    { content: `${todoTemplate.content}\n备注{{thing2.DATA}}` },
    { content: `${todoTemplate.content}\n截止时间{{time8.DATA}}` },
    { content: todoTemplate.content.replace('thing2', 'amount2') },
    { content: `${todoTemplate.content}\n未声明的内容` },
  ])
    assert.equal(reminderTemplate({ ...todoTemplate, ...change }), null)
})

test('rejects corrupt saved mappings instead of overwriting the protected name and expiry', () => {
  for (const extra_fields of [
    ['time3'],
    ['thing2'],
    ['time16', 'time16'],
    ['amount4'],
    { fields: 'time16' },
  ]) {
    assert.throws(() =>
      reminderData(
        { device_field: 'thing2', date_field: 'time3', warranty_end: '2026-12-31', extra_fields },
        '示例设备',
        '2026-10-27 01:00:00.000',
      ),
    )
  }
})

test('accepts a credentialed SCF timer without requiring a WeChat source marker', () => {
  const token = 'a'.repeat(64)
  const event = {
    Type: 'Timer',
    TriggerName: 'gearflow-warranty-reminders',
    Message: JSON.stringify({ timerToken: token }),
  }
  assert.equal(isTimerInvocation(event, { SOURCE: '' }, token), true)
  assert.equal(isTimerInvocation({ ...event, Message: '' }, { SOURCE: 'wx_trigger' }), true)
})

test('rejects forged timer sources, client identities, invalid credentials and trigger names', () => {
  const token = 'a'.repeat(64)
  const event = {
    Type: 'Timer',
    TriggerName: 'gearflow-warranty-reminders',
    Message: JSON.stringify({ timerToken: token }),
  }
  assert.equal(
    isTimerInvocation({ ...event, SOURCE: 'wx_trigger', Message: '' }, { SOURCE: '' }, token),
    false,
  )
  assert.equal(
    isTimerInvocation(event, { SOURCE: 'wx_client', OPENID: 'synthetic-owner' }, token),
    false,
  )
  assert.equal(isTimerInvocation(event, { SOURCE: '' }, 'b'.repeat(64)), false)
  assert.equal(isTimerInvocation(event, { SOURCE: '' }), false)
  assert.equal(isTimerInvocation({ ...event, TriggerName: 'other' }, { SOURCE: '' }, token), false)
  assert.equal(isTimerInvocation({ ...event, Message: '{broken' }, { SOURCE: '' }, token), false)
  assert.equal(
    isTimerInvocation({ ...event, Message: 'a'.repeat(513) }, { SOURCE: '' }, token),
    false,
  )
})

test('timer configuration preserves existing variables and reuses its existing credential', () => {
  const original = [{ Key: 'EXISTING_SETTING', Value: 'synthetic-preserved' }]
  const configured = timerVariables(original, 'a'.repeat(64))
  assert.deepEqual(configured.variables[0], original[0])
  assert.equal(original.length, 1)
  assert.equal(configured.changed, true)
  const repeated = timerVariables(configured.variables, 'b'.repeat(64))
  assert.equal(repeated.changed, false)
  assert.equal(repeated.token, 'a'.repeat(64))
  assert.deepEqual(repeated.variables, configured.variables)
  assert.throws(() =>
    timerVariables(
      [{ Key: 'GEARFLOW_TIMER_TOKEN', Value: 'unexpected-existing-value' }],
      'a'.repeat(64),
    ),
  )
})
