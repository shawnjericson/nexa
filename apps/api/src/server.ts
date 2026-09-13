import { createServer } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { checkDatabase, prisma } from './infrastructure/database/prisma';
import { logger } from './infrastructure/logger/logger';
import { mongoClient, mongoDb } from './infrastructure/mongo/mongo';
import { checkRedis, redis } from './infrastructure/redis/redis';
import { objectStorage } from './infrastructure/storage/storage';
import { RealtimeHub } from './infrastructure/websocket/realtime-hub';

const realtime = new RealtimeHub();
const app = createApp({
  prisma,
  redis,
  mongo: mongoDb,
  storage: objectStorage,
  realtime,
  backgroundJobs: true,
  // MongoDB and object storage are not readiness dependencies: audit entries queue in PostgreSQL,
  // and uploads answer 503 while storage is down.
  readinessChecks: { database: checkDatabase, ...(redis && { redis: checkRedis }) },
});
const server = createServer(app);
realtime.attach(server, { corsOrigins: env.CORS_ORIGINS, redis });

server.listen(env.PORT, () => {
  logger.info(
    `NEXA API listening on http://localhost:${env.PORT} (docs: /docs, realtime: ${
      redis ? 'Redis adapter' : 'single instance'
    }, audit log: ${mongoDb ? 'MongoDB' : 'disabled'}, files: ${
      objectStorage ? objectStorage.description : 'disabled'
    })`,
  );
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');

  setTimeout(() => process.exit(1), 10_000).unref();
  // Closing the realtime hub disconnects every socket and closes the HTTP server.
  realtime
    .close()
    .then(() => Promise.all([prisma.$disconnect(), redis?.quit(), mongoClient?.close()]))
    .then(
      () => process.exit(0),
      (err: unknown) => {
        logger.error({ err }, 'Shutdown failed');
        process.exit(1);
      },
    );
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});
