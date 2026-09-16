import { z } from 'zod';
import { errorResponses, registry, successResponse } from '../../../shared/http/openapi';
import { registerRoute } from '../../../shared/http/openapi-route';
import {
  AvatarResponse,
  CreateUploadBody,
  CreateUploadResponse,
  FileParams,
  FileResponse,
  SetAvatarBody,
} from './schemas';

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

registerRoute({
  method: 'put',
  path: '/api/v1/users/me/avatar',
  tag: 'Users',
  summary: 'Use one of your uploaded pictures as your avatar',
  description:
    'Upload the picture with /files first. The answered avatar_url serves the picture publicly ' +
    'while it is your avatar; the previous picture is cleaned up later.',
  headers,
  body: SetAvatarBody,
  response: successResponse(AvatarResponse),
  errors: [400, 401, 403, 404, 409, 413, 422],
});
registerRoute({
  method: 'delete',
  path: '/api/v1/users/me/avatar',
  tag: 'Users',
  summary: 'Remove your avatar',
  headers,
  response: successResponse(AvatarResponse),
  errors: [401, 403],
});
registry.registerPath({
  method: 'get',
  path: '/api/v1/avatars/{id}',
  tags: ['Users'],
  summary: 'An avatar picture',
  description:
    'Public, for <img> tags: redirects to a short-lived storage URL, cacheable for an hour. ' +
    "Only files chosen as someone's avatar are served.",
  request: { params: FileParams },
  responses: { 302: { description: 'Redirect to the picture' }, ...errorResponses(404) },
});
