'use strict';

const { Pool } = require('pg');

function createPool(config) {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required to initialize the replacement platform.');
  }

  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    application_name: 'haavocato-platform',
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: true } : undefined,
  });

  pool.on('error', (error) => {
    // Avoid logging connection strings, SQL parameters, or client data.
    console.error('Unexpected PostgreSQL pool error:', error.message);
  });

  return pool;
}

async function checkDatabase(pool) {
  const result = await pool.query('SELECT 1 AS ok');
  return result.rows[0]?.ok === 1;
}

module.exports = { createPool, checkDatabase };
