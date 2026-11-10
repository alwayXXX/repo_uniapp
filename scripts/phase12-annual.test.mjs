import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
import { test } from 'node:test'
const require = createRequire(import.meta.url)
const { generateAnnual, validateAnnualFacts } = require('../cloudfunctions/gearflow-ai/annual.js')

function report() {
  return {
    year: 2026,
    currency: 'CNY',
    deviceCount: 2,
    purchaseCount: 1,
    purchaseCents: 10000,
    maintenanceCount: 0,
    maintenanceCents: 0,
    disposalCount: 1,
    disposalIncomeCents: 20000,
    totalSpendCents: 10000,
    netSpendCents: -10000,
    months: Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      purchaseCount: index === 0 ? 1 : 0,
      purchaseCents: index === 0 ? 10000 : 0,
      maintenanceCount: 0,
      maintenanceCents: 0,
      disposalCount: index === 2 ? 1 : 0,
      disposalIncomeCents: index === 2 ? 20000 : 0,
    })),
  }
}

test('annual interpretation accepts consistent numbers and retains the negative net', async () => {
  const input = report()
  let invoked = false
  const result = await generateAnnual(input, async (request) => {
    invoked = true
    assert.equal(JSON.parse(request.messages[1].content).netSpendCents, -10000)
    return { text: '{"observations":["记录了设备处置"],"suggestions":["定期检查台账"]}' }
  })
  assert.equal(invoked, true)
  assert.deepEqual(result.observations, ['记录了设备处置'])
})

test('inconsistent totals, duplicate months, extra private fields and malformed replies are rejected', async () => {
  const input = report()
  assert.throws(() => validateAnnualFacts({ ...input, totalSpendCents: 1 }), /INVALID_AI_INPUT/)
  assert.throws(
    () =>
      validateAnnualFacts({
        ...input,
        months: input.months.map((item) => ({ ...item, month: 1 })),
      }),
    /INVALID_AI_INPUT/,
  )
  assert.throws(
    () => validateAnnualFacts({ ...input, serialNumber: 'private' }),
    /INVALID_AI_INPUT/,
  )
  await assert.rejects(
    generateAnnual(input, async () => ({ text: '{"observations":[],"suggestions":[""]}' })),
    /INVALID_AI_RESULT/,
  )
  await assert.rejects(
    generateAnnual(input, async () => ({
      text: '{"observations":["共购买999台"],"suggestions":[]}',
    })),
    /INVALID_AI_RESULT/,
  )
  await assert.rejects(
    generateAnnual(input, async () => ({
      text: '{"observations":["共购买三台"],"suggestions":[]}',
    })),
    /INVALID_AI_RESULT/,
  )
})
