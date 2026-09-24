import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { formatVerification, verifyRelease } from './verify-phase10.mjs'

const temporaryRoot = resolve(tmpdir())
const workspaces = []

function fixture(project = {}, app = {}) {
  const root = mkdtempSync(join(temporaryRoot, 'gearflow-release-test-'))
  workspaces.push(root)
  mkdirSync(join(root, 'cloudfunctions'))
  writeFileSync(
    join(root, 'project.config.json'),
    JSON.stringify({
      setting: { urlCheck: true },
      cloudfunctionRoot: 'cloudfunctions/',
      ...project,
    }),
  )
  writeFileSync(join(root, 'app.json'), JSON.stringify({ pages: ['pages/home/index'], ...app }))
  writeFileSync(join(root, 'app.js'), 'App({})')
  return root
}

afterEach(() => {
  for (const root of workspaces.splice(0)) {
    assert.equal(dirname(resolve(root)), temporaryRoot)
    assert.ok(basename(root).startsWith('gearflow-release-test-'))
    rmSync(root, { recursive: true, force: true })
  }
})

test('runs generic scanning and truthfully reports unconfigured exact scanning', () => {
  const result = verifyRelease(fixture())
  assert.deepEqual(result.failures, [])
  assert.equal(result.scannedFiles, 3)
  assert.equal(result.exactSecretCount, 0)
  assert.equal(result.scanStatus, 'complete')
  assert.match(formatVerification(result).join('\n'), /附加精确值扫描未执行/)
})

test('reports a missing build as not scanned, never as a completed credential check', () => {
  const result = verifyRelease(join(fixture(), 'missing'), { WX_SECRET: 'synthetic-value' })
  assert.equal(result.scanStatus, 'not_run')
  const output = formatVerification(result).join('\n')
  assert.match(output, /通用凭据模式扫描：未执行/)
  assert.match(output, /附加精确值扫描：未执行/)
  assert.ok(!output.includes('[PASS]'))
})

test('does not count whitespace-only variables as configured secrets', () => {
  const result = verifyRelease(fixture(), { WX_SECRET: '  ', TCB_SECRET_KEY: '\n' })
  assert.equal(result.exactSecretCount, 0)
  assert.match(formatVerification(result).join('\n'), /附加精确值扫描未执行/)
})

test('requires a release build with URL validation and a cloud-function root', () => {
  const result = verifyRelease(fixture({ setting: { urlCheck: false }, cloudfunctionRoot: '' }))
  assert.ok(result.failures.some((failure) => failure.includes('urlCheck')))
  assert.ok(result.failures.some((failure) => failure.includes('cloudfunctions/')))
})

test('rejects missing or invalid build manifests', () => {
  const root = fixture()
  writeFileSync(join(root, 'app.json'), 'not JSON')
  assert.ok(verifyRelease(root).failures.length > 0)
  assert.ok(verifyRelease(join(root, 'missing')).failures.length > 0)
})

test('rejects development routes in both main package and subpackages', () => {
  for (const app of [
    { pages: ['pages/dev/identity'] },
    { subPackages: [{ root: 'pages/dev', pages: ['identity'] }] },
  ]) {
    assert.ok(
      verifyRelease(fixture({}, app)).failures.some(
        (failure) => failure.includes('开发') || failure.includes('pages/dev'),
      ),
    )
  }
})

const syntheticPem = `-----BEGIN PRIVATE KEY-----\n${'A'.repeat(64)}\n-----END PRIVATE KEY-----`
const syntheticJwt = [
  Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url'),
  Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url'),
  'synthetic_signature_not_valid',
].join('.')

for (const [name, content] of [
  ['AppSecret literal', `const WX_SECRET = "${'a'.repeat(32)}"`],
  ['private key', JSON.stringify({ private_key: syntheticPem })],
  ['Tencent credential ID', `AKID${'A'.repeat(32)}`],
  ['secret key literal', 'const config = {secretKey: "synthetic-secret-not-a-real-key"}'],
  ['service-role JWT', syntheticJwt],
]) {
  test(`detects ${name} without any configured production secrets`, () => {
    const root = fixture()
    writeFileSync(join(root, 'app.js'), content)
    const result = verifyRelease(root)
    assert.ok(result.failures.some((failure) => failure.includes('凭据')))
    const output = formatVerification(result).join('\n')
    assert.ok(!output.includes(content))
    assert.ok(!output.includes('synthetic-secret-not-a-real-key'))
  })
}

test('does not flag environment references or an SDK PEM header constant', () => {
  const root = fixture()
  writeFileSync(
    join(root, 'app.js'),
    'const secret = process.env.WX_SECRET; const header = "-----BEGIN PRIVATE KEY-----";',
  )
  assert.deepEqual(verifyRelease(root).failures, [])
})

test('rejects credentials files even when no key is recognized', () => {
  const root = fixture()
  writeFileSync(join(root, '.env'), 'SYNTHETIC=value')
  assert.ok(verifyRelease(root).failures.some((failure) => failure.includes('.env')))
})

test('supports optional exact-value matching without exposing matched values', () => {
  const root = fixture()
  const value = 'unit-test-only-opaque-secret'
  writeFileSync(join(root, 'app.js'), `const opaque = "${value}"`)
  assert.deepEqual(verifyRelease(root).failures, [])
  const result = verifyRelease(root, { WX_SECRET: value })
  assert.equal(result.exactSecretCount, 1)
  assert.ok(result.failures.some((failure) => failure.includes('精确值')))
  assert.ok(!formatVerification(result).join('\n').includes(value))
})
