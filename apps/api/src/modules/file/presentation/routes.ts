import { Router, type Request, type RequestHandler } from 'express';
import { createRateLimiter } from '../../../shared/http/rate-limit';
import { created, ok } from '../../../shared/http/response';
import { validate } from '../../../shared/http/validate';
import { requireAuthContext } from '../../identity';
import { organizationContext, type OrganizationActor } from '../../organization';
import type { FileService } from '../application/file.service';
import type { FileRecord } from '../domain/file';
import { toFileResponse, toUploadResponse } from './dto';
import { CreateUploadBody, FileParams, type CreateUploadInput } from './schemas';

/** Uploads of the caller in the active organization (spec 12). */
export function createFileRouter(deps: { files: FileService; guard: RequestHandler[] }): Router {
  const { files, guard } = deps;
  // Storage exhaustion protection on top of the pending-upload cap (risk register 17).
  const uploadLimiter = createRateLimiter({ windowMs: 60_000, limit: 30 });

  const actorOf = (req: Request): OrganizationActor => ({
    userId: requireAuthContext(req).userId,
    organization: organizationContext(req),
  });

  async function present(file: FileRecord) {
    return toFileResponse(file, (await files.views([file])).get(file.id));
  }

  const createUpload: RequestHandler = async (req, res) => {
    const body = req.body as CreateUploadInput;
    const { file, upload } = await files.createUpload(actorOf(req), {
      filename: body.filename,
      mimeType: body.content_type,
      size: body.size,
    });
    created(res, { file: toFileResponse(file, undefined), upload: toUploadResponse(upload) });
  };

  const completeUpload: RequestHandler = async (req, res) => {
    const { id } = req.params as { id: string };
    ok(res, await present(await files.completeUpload(actorOf(req), id)));
  };

  const getFile: RequestHandler = async (req, res) => {
    const { id } = req.params as { id: string };
    ok(res, await present(await files.getOwn(actorOf(req), id)));
  };

  const router = Router();
  router.post(
    '/files',
    uploadLimiter,
    ...guard,
    validate({ body: CreateUploadBody }),
    createUpload,
  );
  router.post('/files/:id/complete', ...guard, validate({ params: FileParams }), completeUpload);
  router.get('/files/:id', ...guard, validate({ params: FileParams }), getFile);
  return router;
}
