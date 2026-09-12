import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { logger } from './logger';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Assigns every request an id (reusing a well-formed incoming X-Request-Id),
 * echoes it back in the response header and logs one line per request.
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = req.headers['x-request-id'];
    const id =
      typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
        ? incoming
        : `req_${randomUUID()}`;
    res.setHeader('X-Request-Id', id);
    return id;
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  autoLogging: { ignore: (req) => req.url === '/health' },
});
