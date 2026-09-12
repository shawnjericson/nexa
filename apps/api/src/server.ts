import { createServer } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { checkDatabase, prisma } from './infrastructure/database/prisma';
import { logger } from './infrastructure/logger/logger';

const app = createApp({ prisma, readinessChecks: { database: checkDatabase } });
const server = createServer(app);

server.listen(env.PORT, () => {
  logger.info(`NEXA API listening on http://localhost:${env.PORT} (docs: /docs)`);
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');

  setTimeout(() => process.exit(1), 10_000).unref();
  server.close(async (err) => {
    await prisma.$disconnect();
    process.exit(err ? 1 : 0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});
