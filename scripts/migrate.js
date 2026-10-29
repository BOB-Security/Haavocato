'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { Pool } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: true } : undefined,
    max: 1,
    connectionTimeoutMillis: 5000,
    application_name: 'haavocato-migration-runner',
  });
  const directory = path.join(__dirname, '..', 'db', 'migrations');
  const client = await pool.connect();

  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      checksum_sha256 TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    const files = (await fs.readdir(directory))
      .filter((name) => /^\d{3}_[a-z0-9_-]+\.sql$/.test(name))
      .sort();

    for (const filename of files) {
      const sql = await fs.readFile(path.join(directory, filename), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      const existing = await client.query(
        'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
        [filename]
      );
      if (existing.rows[0]) {
        if (existing.rows[0].checksum_sha256 !== checksum) {
          throw new Error(`Applied migration ${filename} was modified. Create a new migration instead.`);
        }
        console.log('Already applied:', filename);
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
          [filename, checksum]
        );
        await client.query('COMMIT');
        console.log('Applied:', filename);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`Migration ${filename} failed: ${error.message}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Migration runner stopped:', error.message);
  process.exitCode = 1;
});
