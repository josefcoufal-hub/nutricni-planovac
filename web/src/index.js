'use strict';
const { loadConfig } = require('./config');
const { createApp } = require('./app');
const { log } = require('./util');

let cfg;
try { cfg = loadConfig(); } catch (e) { process.stderr.write('Chybná konfigurace: ' + e.message + '\n'); process.exit(1); }

const { server } = createApp(cfg);
server.listen(cfg.port, '0.0.0.0', () => log('info', 'listening', { port: server.address().port, env: cfg.production ? 'production' : 'development', api: cfg.apiUrl }));

function shutdown(sig) {
  log('info', 'shutdown', { sig });
  server.close(() => process.exit(0));
  server.closeIdleConnections && server.closeIdleConnections();
  setTimeout(() => process.exit(0), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (e) => log('error', 'unhandledRejection', { msg: String(e && e.message).slice(0, 200) }));
