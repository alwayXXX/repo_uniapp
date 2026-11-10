import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const guard = require('../cloudfunctions/gearflow-maintenance/index.js')

test('maintenance replacement allows only a fixed health response and no business or timer work', async () => {
  assert.deepEqual(await guard.main({ action: 'health' }), {
    ok: true,
    data: { maintenance: true },
  })
  for (const event of [
    { action: 'device.save' },
    { action: 'ai.request' },
    { TriggerName: 'gearflow-warranty-reminders' },
    {},
  ])
    assert.deepEqual(await guard.main(event), { ok: false, errorCode: 'INTERNAL_ERROR' })
})
