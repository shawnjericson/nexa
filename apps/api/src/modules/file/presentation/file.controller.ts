import type { Request, RequestHandler } from 'express';
import { created, ok } from '../../../shared/http/response';
import { requireAuthContext } from '../../identity';
import { organizationContext, type OrganizationActor } from '../../organization';
import type { FileService } from '../application/file.service';
import type { FileRecord } from '../domain/file';
import { toFileResponse, toUploadResponse } from './dto';
import type { CreateUploadInput } from './schemas';

/** Handlers for uploads: read the request, call the file service, shape the response. */
export function createFileController(deps: { files: FileService }) {
  const { files } = deps;

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

  return { createUpload, completeUpload, getFile };
}
