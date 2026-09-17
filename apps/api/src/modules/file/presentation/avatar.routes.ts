import { Router, type RequestHandler } from 'express';
import { validate } from '../../../shared/http/validate';
import type { AvatarWriter } from '../../identity';
import type { FileService } from '../application/file.service';
import { createAvatarController, createPublicAvatarController } from './avatar.controller';
import { FileParams, SetAvatarBody } from './schemas';

/** Choosing one of your uploaded pictures as your avatar. Handlers: avatar.controller.ts. */
export function createAvatarRouter(deps: {
  files: FileService;
  avatars: AvatarWriter;
  /** Public address of the API, e.g. https://api.nexa.example.com. */
  publicUrl: string;
  guard: RequestHandler[];
}): Router {
  const controller = createAvatarController(deps);
  const router = Router();
  router.put(
    '/users/me/avatar',
    ...deps.guard,
    validate({ body: SetAvatarBody }),
    controller.setAvatar,
  );
  router.delete('/users/me/avatar', ...deps.guard, controller.removeAvatar);
  return router;
}

/**
 * Avatar pictures for <img> tags, which can't send credentials. Only files chosen as someone's
 * avatar are served - any other upload stays private - as a redirect to a short-lived storage URL
 * the browser may cache. Mounted outside the API's global rate limit: a directory page shows
 * many avatars at once.
 */
export function createPublicAvatarRouter(deps: { files: FileService }): Router {
  const controller = createPublicAvatarController(deps);
  const router = Router();
  router.get('/avatars/:id', validate({ params: FileParams }), controller.serveAvatar);
  return router;
}
