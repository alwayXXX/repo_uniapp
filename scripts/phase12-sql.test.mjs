import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

// PostgreSQL simulation of the intended foreign-key behavior; not MySQL acceptance.
test('account deletion freezes existing and new AI grants through a composite foreign key', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE TABLE test_users (openid text NOT NULL, status text NOT NULL, UNIQUE(openid, status));
      CREATE TABLE test_grants (
        id text PRIMARY KEY, openid text NOT NULL, account_status text NOT NULL,
        grant_status text NOT NULL, FOREIGN KEY(openid, account_status)
        REFERENCES test_users(openid, status) ON UPDATE CASCADE ON DELETE CASCADE
      );
      INSERT INTO test_users VALUES ('synthetic-a', 'ACTIVE'), ('synthetic-b', 'ACTIVE');
      INSERT INTO test_grants VALUES ('grant-a', 'synthetic-a', 'ACTIVE', 'ISSUED');
      UPDATE test_users SET status = 'DELETING' WHERE openid = 'synthetic-a';
    `)
    const result = await db.query(`UPDATE test_grants SET grant_status = 'USED'
      WHERE id = 'grant-a' AND account_status = 'ACTIVE' RETURNING id`)
    assert.equal(result.rows.length, 0)
    await assert.rejects(
      db.query(`INSERT INTO test_grants VALUES ('grant-b', 'synthetic-a', 'ACTIVE', 'ISSUED')`),
    )
    await db.query(`INSERT INTO test_grants VALUES ('grant-c', 'synthetic-b', 'ACTIVE', 'ISSUED')`)
    await db.query(`DELETE FROM test_grants WHERE openid = 'synthetic-a'`)
    const remaining = await db.query(`SELECT id FROM test_grants`)
    assert.deepEqual(remaining.rows, [{ id: 'grant-c' }])
  } finally {
    await db.close()
  }
})
