import http from 'node:http';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { initSocket } from './realtime/socket.js';
import { sweepDueSoon } from './services/notificationService.js';

const app = createApp();
const server = http.createServer(app);
initSocket(server);

server.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port} (${env.nodeEnv})`);
});

// Hourly DUE_SOON sweep (skipped in tests — tests call sweepDueSoon directly).
if (!env.isTest) {
  const sweep = setInterval(() => {
    void sweepDueSoon();
  }, 60 * 60 * 1000);
  sweep.unref();
}

function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
