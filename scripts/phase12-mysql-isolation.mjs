import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

// Offline, synthetic-only test. No ports, host mounts or external data are used.
const name = `gearflow-p12-${randomBytes(6).toString('hex')}`
const password = 'local-synthetic-only'
let id = ''
function docker(args, input) {
  const run = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 30000 })
  if (run.status !== 0)
    throw new Error(`Docker command failed: ${run.stderr || run.error?.message || ''}`)
  return run.stdout.trim()
}
function sql(statement) {
  return docker(
    [
      'exec',
      '-i',
      id,
      'mysql',
      '-uroot',
      `-p${password}`,
      '--batch',
      '--skip-column-names',
      'test',
    ],
    statement,
  )
}

try {
  id = docker([
    'run',
    '-d',
    '--pull=never',
    '--name',
    name,
    '--network',
    'none',
    '-e',
    `MYSQL_ROOT_PASSWORD=${password}`,
    '-e',
    'MYSQL_DATABASE=test',
    'mysql:8.0',
  ])
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Unexpected isolated container ID')
  let ready = false
  for (let i = 0; i < 30; i++) {
    const ping = spawnSync(
      'docker',
      ['exec', id, 'mysql', '-uroot', `-p${password}`, '-e', 'SELECT 1'],
      { encoding: 'utf8', timeout: 3000 },
    )
    if (ping.status === 0) {
      ready = true
      break
    }
    await delay(1000)
  }
  if (!ready) throw new Error('Isolated MySQL did not start')
  sql(readFileSync(new URL('../database/mysql/schema.sql', import.meta.url), 'utf8'))
  sql(
    "INSERT INTO users (id,openid) VALUES ('synthetic-user-a','OwnerA'); INSERT INTO devices (id,openid,name) VALUES ('device-a','OwnerA','Synthetic device');",
  )
  if (sql("SELECT COUNT(*) FROM devices WHERE openid='ownera';") !== '0')
    throw new Error('Baseline does not isolate case-sensitive account identifiers')
  sql(
    "INSERT INTO users (id,openid) VALUES ('synthetic-user-b','ownera'); INSERT INTO devices (id,openid,name) VALUES ('device-b','ownera','Synthetic device B');",
  )
  if (sql("SELECT GROUP_CONCAT(id ORDER BY id) FROM devices WHERE openid='OwnerA';") !== 'device-a')
    throw new Error('Owner A isolation failed')
  if (sql("SELECT GROUP_CONCAT(id ORDER BY id) FROM devices WHERE openid='ownera';") !== 'device-b')
    throw new Error('Owner B isolation failed')
  sql(
    "INSERT INTO ai_grants (id,openid,account_status,kind,input_digest,expires_at_ms) VALUES ('grant-a','OwnerA','ACTIVE','advisor',REPEAT('a',64),9999999999999); UPDATE users SET status='DELETING' WHERE openid='OwnerA';",
  )
  if (sql("SELECT COUNT(*) FROM ai_grants WHERE id='grant-a' AND account_status='ACTIVE';") !== '0')
    throw new Error('Deleting account grant was not frozen')
  if (sql("SELECT COUNT(*) FROM users WHERE openid='ownera' AND status='ACTIVE';") !== '1')
    throw new Error('Other account changed')
  console.log(
    'PASS: current baseline supports case-sensitive isolation and grant freeze in offline MySQL 8',
  )
} finally {
  if (/^[a-f0-9]{64}$/.test(id)) docker(['rm', '-f', '-v', id])
}
