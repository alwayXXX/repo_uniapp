import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { prepareFunctions } from './prepare-phase12-functions.mjs'

test('each staged function contains its own dependencies and preserves reminder configuration', async () => {
  const output = await prepareFunctions()
  try {
    const api = join(output, 'gearflow-api')
    const ai = join(output, 'gearflow-ai')
    const entry = await readFile(join(api, 'index.js'), 'utf8')
    assert.match(entry, /require\('\.\/ai\/gateway'\)/)
    assert.match(entry, /require\('\.\/ai\/ledger'\)/)
    assert.doesNotMatch(entry, /require\('\.\.\/gearflow-ai\//)
    const config = JSON.parse(await readFile(join(api, 'config.json'), 'utf8'))
    assert.equal(config.triggers[0].config, '0 0 * * * * *')
    assert.deepEqual(config.permissions.openapi, [
      'subscribeMessage.getTemplateList',
      'subscribeMessage.send',
    ])
    for (const folder of [api, join(api, 'ai'), ai])
      for (const file of await readdir(folder))
        if (file.endsWith('.js')) execFileSync(process.execPath, ['--check', join(folder, file)])
  } finally {
    await rm(output, { recursive: true, force: true })
  }
})
