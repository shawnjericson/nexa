import { z } from 'zod';
import { successResponse } from '../../../shared/http/openapi';
import { registerRoute } from '../../../shared/http/openapi-route';
import { CreateUploadBody, CreateUploadResponse, FileParams, FileResponse } from './schemas';

const headers = z.object({
  'x-organization-id': z.uuid().optional().openapi({
    description: 'Active organization. Optional when you belong to exactly one organization.',
  }),
});

const TAG = 'Files';

registerRoute({
  method: 'post',
  path: '/api/v1/files',
  tag: TAG,
  summary: 'Start an upload',
  description:
    'Reserves the file and returns a presigned PUT URL. Send the bytes straight to that URL with ' +
    'the returned headers (the body must be exactly `size` bytes), then call `complete`.',
  headers,
  body: CreateUploadBody,
  status: 201,
  response: successResponse(CreateUploadResponse),
  errors: [400, 401, 403, 413, 429, 503],
});
registerRoute({
  method: 'post',
  path: '/api/v1/files/{id}/complete',
  tag: TAG,
  summary: 'Finish an upload',
  description:
    'Checks the stored object: its size, and that its first bytes match the declared type. ' +
    'A mismatch deletes the object and marks the file FAILED (422). Idempotent.',
  headers,
  params: FileParams,
  response: successResponse(FileResponse),
  errors: [401, 403, 404, 409, 422, 503],
});
registerRoute({
  method: 'get',
  path: '/api/v1/files/{id}',
  tag: TAG,
  summary: 'One of your uploads',
  description:
    'Files attached to posts and messages come with download URLs inside those resources; this ' +
    'endpoint is for the uploader.',
  headers,
  params: FileParams,
  response: successResponse(FileResponse),
  errors: [400, 401, 403, 404],
});
