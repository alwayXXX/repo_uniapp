import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { access, readFile, readdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { prepareFunctions } from './prepare-phase12-functions.mjs'

test('each staged function contains its own dependencies and preserves reminder configuration', async () => {
  const output = await prepareFunctions()
  try {
    const api = join(output, 'gearflow-api')
    const ai = join(output, 'gearflow-ai')
    const maintenance = join(output, 'maintenance', 'gearflow-api')
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
    assert.equal(
      await readFile(join(maintenance, 'config.json'), 'utf8'),
      await readFile(join(api, 'config.json'), 'utf8'),
    )
    for (const folder of [api, join(api, 'ai'), ai, maintenance])
      for (const file of await readdir(folder)) {
        if (!file.endsWith('.js')) continue
        const path = join(folder, file)
        execFileSync(process.execPath, ['--check', path])
        const source = await readFile(path, 'utf8')
        for (const match of source.matchAll(/require\(['"](\.[^'"]+)['"]\)/g))
          await access(resolve(folder, `${match[1]}.js`))
      }
  } finally {
    await rm(output, { recursive: true, force: true })
  }
})
