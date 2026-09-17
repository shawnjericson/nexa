import { Router, type RequestHandler } from 'express';
import { createRateLimiter } from '../../../shared/http/rate-limit';
import { validate } from '../../../shared/http/validate';
import type { FileService } from '../application/file.service';
import { createFileController } from './file.controller';
import { CreateUploadBody, FileParams } from './schemas';

/** Uploads of the caller in the active organization (spec 12). Handlers: file.controller.ts. */
export function createFileRouter(deps: { files: FileService; guard: RequestHandler[] }): Router {
  const { guard } = deps;
  const controller = createFileController(deps);
  // Storage exhaustion protection on top of the pending-upload cap (risk register 17).
  const uploadLimiter = createRateLimiter({ windowMs: 60_000, limit: 30 });

  const router = Router();
  router.post(
    '/files',
    uploadLimiter,
    ...guard,
    validate({ body: CreateUploadBody }),
    controller.createUpload,
  );
  router.post(
    '/files/:id/complete',
    ...guard,
    validate({ params: FileParams }),
    controller.completeUpload,
  );
  router.get('/files/:id', ...guard, validate({ params: FileParams }), controller.getFile);
  return router;
}
