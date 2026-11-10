import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
import { test } from 'node:test'
const require = createRequire(import.meta.url)
const { generateAdvisor, parseAdvisorResult } = require('../cloudfunctions/gearflow-ai/advisor.js')
const facts = {
  asOf: '2026-11-10',
  category: '电脑',
  brand: 'Example',
  model: 'M1',
  status: 'IN_USE',
  purchaseDate: '2024-01-01',
  warrantyEndDate: null,
  maintenanceCount: 1,
  knownMaintenanceCents: 0,
  maintenanceCostUnknownCount: 1,
}

test('only the confirmed device whitelist reaches the model', async () => {
  let calls = 0
  const result = await generateAdvisor(facts, async (request) => {
    calls++
    assert.deepEqual(JSON.parse(request.messages[1].content), facts)
    return { text: '{"suggestions":["查看设备使用状况"],"missing":["维护费用未完整记录"]}' }
  })
  assert.equal(calls, 1)
  assert.deepEqual(result.missing, ['维护费用未完整记录'])
  await assert.rejects(
    generateAdvisor({ ...facts, serialNumber: 'private' }, async () => {
      throw new Error('must not call')
    }),
    /INVALID_AI_INPUT/,
  )
})

test('invalid dates, costs and malformed model responses fail closed', async () => {
  await assert.rejects(
    generateAdvisor({ ...facts, asOf: '2026-02-30' }, () => {}),
    /INVALID_AI_INPUT/,
  )
  await assert.rejects(
    generateAdvisor({ ...facts, maintenanceCostUnknownCount: 2 }, () => {}),
    /INVALID_AI_INPUT/,
  )
  assert.throws(() => parseAdvisorResult('not json'), /INVALID_AI_RESULT/)
  assert.throws(() => parseAdvisorResult('{"suggestions":[""],"missing":[]}'), /INVALID_AI_RESULT/)
  assert.deepEqual(parseAdvisorResult('```json\n{"suggestions":[],"missing":[]}\n```'), {
    suggestions: [],
    missing: [],
  })
})
