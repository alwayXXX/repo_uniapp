import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, describe, test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const migrationRoot = fileURLToPath(new URL('../cloudbase/migrations/', import.meta.url))
const migrations = readdirSync(migrationRoot)
  .filter((name) => name.endsWith('.sql'))
  .sort()
const ownerA = 'synthetic-owner-a'
const ownerB = 'synthetic-owner-b'
const businessTables = [
  'devices',
  'maintenance_records',
  'warranties',
  'device_costs',
  'device_timelines',
  'consent_records',
]
const allTables = ['users', 'device_categories', ...businessTables]
let db
let categoryId
const applied = []

// Each role operation has its own savepoint so rejected SQL cannot poison the test transaction.
async function queryAs(uid, sql, values = [], role = 'authenticated') {
  assert.ok(['authenticated', 'anon'].includes(role))
  await db.exec('SAVEPOINT actor_request')
  try {
    await db.exec(`SET LOCAL ROLE ${role}`)
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [uid ?? ''])
    const result = await db.query(sql, values)
    await db.exec('RESET ROLE')
    await db.query("SELECT set_config('request.jwt.claim.sub', '', true)")
    await db.exec('RELEASE SAVEPOINT actor_request')
    return result
  } catch (error) {
    await db.exec('ROLLBACK TO SAVEPOINT actor_request')
    await db.exec('RELEASE SAVEPOINT actor_request')
    throw error
  }
}

async function rpc(uid, name, args = []) {
  assert.match(name, /^gf_[a-z_]+$/)
  const placeholders = args.map((_, index) => `$${index + 1}`).join(', ')
  const result = await queryAs(uid, `SELECT public.${name}(${placeholders}) AS result`, args)
  return result.rows[0].result
}

async function bootstrap(uid) {
  return (await rpc(uid, 'gf_bootstrap_user', ['1.0.1', '1.0.1'])).user
}

async function saveDevice(uid, patch = {}) {
  const values = {
    id: null,
    categoryId,
    name: 'Synthetic device',
    status: 'IN_USE',
    price: 10000,
    warrantyMode: 'SET',
    start: '2026-01-01',
    end: '2027-01-01',
    ...patch,
  }
  return rpc(uid, 'gf_save_device_with_warranty', [
    values.id,
    values.categoryId,
    values.name,
    values.status,
    null,
    null,
    null,
    '2026-01-01',
    null,
    values.price,
    null,
    values.warrantyMode,
    values.start,
    values.end,
    'Synthetic provider',
  ])
}

async function addMaintenance(uid, deviceId, price = 1000, date = '2026-02-01') {
  return rpc(uid, 'gf_add_maintenance', [
    deviceId,
    'Synthetic repair',
    'REPAIR',
    date,
    price,
    null,
    null,
  ])
}

async function count(table, uid) {
  assert.ok(businessTables.includes(table))
  return (await db.query(`SELECT count(*)::int AS count FROM ${table} WHERE user_id = $1`, [uid]))
    .rows[0].count
}

describe('migration, RLS, and transactional business regression', { concurrency: false }, () => {
  before(async () => {
    // No connection strings, credentials, local data files, or network-backed database.
    db = new PGlite()
    await db.exec(`
      CREATE ROLE authenticated;
      CREATE ROLE anon;
      CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS text LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '') $$;
      GRANT USAGE ON SCHEMA auth, public TO authenticated, anon, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
    `)
    for (const name of migrations) {
      let sql = readFileSync(join(migrationRoot, name), 'utf8')
      if (name === '20260830141710_gearflow_phase_one_tables.sql') {
        // This one historical CloudBase migration executed only its first statement.
        // The second statement was applied separately as 20260830141730. Never skip other errors.
        const lines = sql.trim().split(/\r?\n/)
        assert.equal(lines.length, 2)
        assert.match(lines[0], /^CREATE TABLE users /)
        assert.equal(
          lines[1],
          readFileSync(
            join(migrationRoot, '20260830141730_gearflow_phase_one_devices.sql'),
            'utf8',
          ).trim(),
        )
        sql = lines[0]
      }
      try {
        await db.exec(sql)
      } catch (cause) {
        throw new Error(`Migration replay failed: ${name}`, { cause })
      }
      applied.push(name)
    }
    categoryId = (
      await db.query(
        'SELECT id FROM device_categories WHERE is_active = true ORDER BY sort_order LIMIT 1',
      )
    ).rows[0].id
  })
  after(async () => {
    if (db) await db.close()
  })
  beforeEach(async () => {
    await db.exec('BEGIN')
  })
  afterEach(async () => {
    await db.exec('ROLLBACK')
  })

  test('replays all active migrations and retains strict table permissions', async () => {
    assert.ok(applied.length >= 112)
    assert.deepEqual(applied, migrations)
    for (const table of allTables) {
      const result = await db.query(
        `
        SELECT relrowsecurity AS rls,
          has_table_privilege('authenticated', oid, 'SELECT') AS can_read,
          has_table_privilege('authenticated', oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS can_write,
          has_table_privilege('anon', oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS anon_access
        FROM pg_class WHERE oid = $1::regclass
      `,
        [table],
      )
      assert.deepEqual(
        result.rows,
        [{ rls: true, can_read: true, can_write: false, anon_access: false }],
        table,
      )
    }
    const functions = await db.query(`
      SELECT proname, has_function_privilege('anon', oid, 'EXECUTE') AS anon_access,
        has_function_privilege('authenticated', oid, 'EXECUTE') AS can_call
      FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'gf_%'
    `)
    for (const fn of functions.rows) {
      assert.equal(fn.anon_access, false, fn.proname)
      assert.equal(fn.can_call, fn.proname !== 'gf_append_device_timeline', fn.proname)
    }
  })

  test('rejects anonymous reads and RPC calls, even with a forged subject', async () => {
    for (const sql of [
      'SELECT * FROM devices',
      "SELECT gf_bootstrap_user('1.0.1', '1.0.1')",
      'SELECT gf_delete_account()',
    ]) {
      await assert.rejects(queryAs(ownerA, sql, [], 'anon'), { code: '42501' })
    }
    assert.equal((await db.query('SELECT count(*)::int AS count FROM users')).rows[0].count, 0)
  })

  test('blocks authenticated direct writes and identity reassignment', async () => {
    await bootstrap(ownerA)
    for (const sql of [
      "INSERT INTO devices(name) VALUES ('Forbidden')",
      "UPDATE users SET identity_id = 'forged-owner'",
      'DELETE FROM consent_records',
      'TRUNCATE devices',
      "INSERT INTO maintenance_records(device_id, title, type, occurred_at) VALUES (gen_random_uuid(), 'Forbidden', 'REPAIR', CURRENT_DATE)",
    ]) {
      await assert.rejects(queryAs(ownerA, sql), { code: '42501' })
    }
  })

  test('isolates every private table and rejects cross-user RPC updates', async () => {
    await bootstrap(ownerA)
    await bootstrap(ownerB)
    const deviceA = await saveDevice(ownerA)
    const deviceB = await saveDevice(ownerB)
    const maintenanceA = await addMaintenance(ownerA, deviceA.id)
    await addMaintenance(ownerB, deviceB.id)
    for (const table of businessTables) {
      const result = await queryAs(ownerB, `SELECT DISTINCT user_id FROM ${table}`)
      assert.deepEqual(result.rows, [{ user_id: ownerB }], table)
    }
    assert.deepEqual((await queryAs(ownerB, 'SELECT identity_id FROM users')).rows, [
      { identity_id: ownerB },
    ])
    assert.deepEqual(
      (await queryAs(ownerB, 'SELECT id FROM devices WHERE id = $1', [deviceA.id])).rows,
      [],
    )
    assert.equal(
      (await saveDevice(ownerB, { id: deviceA.id, name: 'Forbidden change' })).errorCode,
      'DEVICE_NOT_FOUND',
    )
    assert.equal((await rpc(ownerB, 'gf_delete_maintenance', [maintenanceA.id])).ok, false)
    assert.equal((await rpc(ownerB, 'gf_soft_delete_device', [deviceA.id])).ok, false)
    assert.equal(await count('maintenance_records', ownerA), 1)
  })

  test('supports custom-login subjects longer than 64 characters across all user tables', async () => {
    const uid = 'synthetic-long-subject-'.repeat(6)
    assert.ok(uid.length > 64 && uid.length < 255)
    await bootstrap(uid)
    const device = await saveDevice(uid)
    assert.equal(device.ok, true)
    assert.equal((await addMaintenance(uid, device.id)).ok, true)
    for (const table of businessTables) assert.ok((await count(table, uid)) > 0, table)
    assert.deepEqual((await queryAs(uid, 'SELECT identity_id FROM users')).rows, [
      { identity_id: uid },
    ])
  })

  test('keeps consent records idempotent for an explicitly accepted version', async () => {
    await bootstrap(ownerA)
    await bootstrap(ownerA)
    assert.equal(await count('consent_records', ownerA), 2)
    await rpc(ownerA, 'gf_bootstrap_user', ['synthetic-v2', 'synthetic-v2'])
    assert.equal(await count('consent_records', ownerA), 4)
  })

  test('rejects invalid warranty creation without writing a device or timeline', async () => {
    await bootstrap(ownerA)
    const result = await saveDevice(ownerA, { end: '2025-01-01' })
    assert.equal(result.ok, false)
    for (const table of ['devices', 'warranties', 'device_timelines'])
      assert.equal(await count(table, ownerA), 0)
  })

  test('rolls back device and timeline changes when warranty storage fails later', async () => {
    await bootstrap(ownerA)
    const device = await saveDevice(ownerA, { warrantyMode: 'CLEAR' })
    // A test-only trigger forces failure after the RPC has already changed devices.
    await db.exec(`
      CREATE FUNCTION test_reject_warranty() RETURNS trigger LANGUAGE plpgsql AS
        $$ BEGIN RAISE EXCEPTION 'synthetic storage failure' USING ERRCODE = '23514'; END $$;
      CREATE TRIGGER test_warranty_failure BEFORE INSERT OR UPDATE ON warranties
        FOR EACH ROW EXECUTE FUNCTION test_reject_warranty();
    `)
    const timelinesBefore = await count('device_timelines', ownerA)
    await assert.rejects(saveDevice(ownerA, { id: device.id, name: 'Must roll back' }), {
      code: '23514',
    })
    assert.equal(
      (await db.query('SELECT name FROM devices WHERE id = $1', [device.id])).rows[0].name,
      'Synthetic device',
    )
    await assert.rejects(saveDevice(ownerA), { code: '23514' })
    assert.equal(await count('devices', ownerA), 1)
    assert.equal(await count('warranties', ownerA), 0)
    assert.equal(await count('device_timelines', ownerA), timelinesBefore)
  })

  test('preserves KEEP and applies explicit CLEAR in the device transaction', async () => {
    await bootstrap(ownerA)
    const device = await saveDevice(ownerA)
    await saveDevice(ownerA, {
      id: device.id,
      name: 'Renamed',
      warrantyMode: 'KEEP',
      start: null,
      end: null,
    })
    assert.equal(await count('warranties', ownerA), 1)
    await saveDevice(ownerA, { id: device.id, warrantyMode: 'CLEAR', start: null, end: null })
    assert.equal(await count('warranties', ownerA), 0)
  })

  test('does not deduplicate same-day same-price maintenance; updates and deletes costs by record', async () => {
    await bootstrap(ownerA)
    const device = await saveDevice(ownerA)
    const first = await addMaintenance(ownerA, device.id)
    const second = await addMaintenance(ownerA, device.id)
    assert.notEqual(first.id, second.id)
    assert.equal(await count('device_costs', ownerA), 2)
    const updated = await rpc(ownerA, 'gf_update_maintenance', [
      first.id,
      'Updated repair',
      'REPAIR',
      '2026-02-01',
      2000,
      null,
      null,
    ])
    assert.equal(updated.ok, true)
    const total = (
      await db.query(
        'SELECT sum(amount_cents)::int AS total FROM device_costs WHERE user_id = $1',
        [ownerA],
      )
    ).rows[0].total
    assert.equal(total, 3000)
    await rpc(ownerA, 'gf_update_maintenance', [
      first.id,
      'Updated repair',
      'REPAIR',
      '2026-02-01',
      null,
      null,
      null,
    ])
    assert.equal(await count('device_costs', ownerA), 1)
    assert.equal((await rpc(ownerA, 'gf_delete_maintenance', [second.id])).deletedCosts, 1)
    assert.equal(await count('device_costs', ownerA), 0)
    assert.equal(await count('maintenance_records', ownerA), 1)
  })

  test('invalid maintenance dates write neither records, costs, nor timeline events', async () => {
    await bootstrap(ownerA)
    const device = await saveDevice(ownerA)
    const timelinesBefore = await count('device_timelines', ownerA)
    assert.equal((await addMaintenance(ownerA, device.id, 1000, '2025-01-01')).ok, false)
    assert.equal(await count('maintenance_records', ownerA), 0)
    assert.equal(await count('device_costs', ownerA), 0)
    assert.equal(await count('device_timelines', ownerA), timelinesBefore)
  })

  test('soft deletion hides related history and removes the device from aggregate statistics', async () => {
    await bootstrap(ownerA)
    const device = await saveDevice(ownerA)
    const maintenance = await addMaintenance(ownerA, device.id)
    assert.equal((await rpc(ownerA, 'gf_soft_delete_device', [device.id])).ok, true)
    for (const table of ['maintenance_records', 'device_costs', 'warranties', 'device_timelines']) {
      assert.deepEqual((await queryAs(ownerA, `SELECT id FROM ${table}`)).rows, [], table)
      assert.ok((await count(table, ownerA)) > 0, 'Soft deletion retains server-side history')
    }
    assert.deepEqual(
      (await queryAs(ownerA, 'SELECT id FROM devices WHERE deleted_at IS NULL')).rows,
      [],
    )
    const overview = await rpc(ownerA, 'gf_get_statistics_overview', [
      '2026-01-01',
      '2026-12-31',
      null,
    ])
    assert.equal(overview.deviceCount, 0)
    assert.equal(overview.totalAssetCents, 0)
    assert.equal(overview.maintenanceSpendCents, 0)
    assert.equal((await rpc(ownerA, 'gf_delete_maintenance', [maintenance.id])).ok, false)
  })

  test('account deletion removes active and soft-deleted data while preserving another user', async () => {
    const userA = await bootstrap(ownerA)
    await bootstrap(ownerB)
    await rpc(ownerA, 'gf_update_profile', ['Synthetic nickname', null])
    const activeA = await saveDevice(ownerA)
    const deletedA = await saveDevice(ownerA)
    const deviceB = await saveDevice(ownerB)
    await addMaintenance(ownerA, activeA.id)
    await addMaintenance(ownerA, deletedA.id)
    await addMaintenance(ownerB, deviceB.id)
    await rpc(ownerA, 'gf_soft_delete_device', [deletedA.id])
    const result = await rpc(ownerA, 'gf_delete_account')
    assert.equal(result.status, 'DELETED')
    for (const table of businessTables) {
      assert.equal(await count(table, ownerA), 0, table)
      assert.ok((await count(table, ownerB)) > 0, table)
    }
    const deletedUser = (
      await db.query('SELECT identity_id, nickname, avatar_url, status FROM users WHERE id = $1', [
        userA.id,
      ])
    ).rows[0]
    assert.match(deletedUser.identity_id, /^deleted:/)
    assert.equal(deletedUser.nickname, null)
    assert.equal(deletedUser.avatar_url, null)
    assert.equal(deletedUser.status, 'DELETED')
    assert.deepEqual((await queryAs(ownerA, 'SELECT id FROM users')).rows, [])
    assert.equal((await queryAs(ownerB, 'SELECT id FROM devices')).rows[0].id, deviceB.id)
  })
})
