'use strict';

const { parseConfig } = require('./config');
const { createPool, checkDatabase } = require('./db/pool');
const { createApp } = require('./app');

async function start() {
  const config = parseConfig();
  const pool = createPool(config);
  try {
    await checkDatabase(pool);
  } catch (error) {
    await pool.end();
    console.error('Database connectivity check failed:', error.message);
    process.exitCode = 1;
    return;
  }

  const app = createApp({ pool, config });
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`Haavocato replacement API listening on port ${config.port}`);
  });

  const shutdown = (signal) => {
    console.log(signal + ' received; shutting down gracefully.');
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Application startup failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { start };
