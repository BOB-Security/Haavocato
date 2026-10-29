'use strict';

// Compatibility entrypoint for hosts that invoke "node server.js" directly.
// The replacement application is implemented in src/ and serves platform/public.
require('./src/server').start().catch((error) => {
  console.error('Application startup failed:', error.message);
  process.exitCode = 1;
});
