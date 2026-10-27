import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
const { annualReport, decodeAttachment, validDate } = createRequire(import.meta.url)(
  '../cloudfunctions/gearflow-api/phase11-domain.js',
)

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
