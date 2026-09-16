import { Router, type RequestHandler } from 'express';
import { ok } from '../../../shared/http/response';
import { validate } from '../../../shared/http/validate';
import { requireAuthContext, type AvatarWriter } from '../../identity';
import { organizationContext } from '../../organization';
import type { FileService } from '../application/file.service';
import { FileErrors } from '../domain/file-errors';
import { FileParams, SetAvatarBody, type SetAvatarInput } from './schemas';

/**
 * How long browsers keep an avatar redirect. Download URLs are valid for at least an hour from
 * any moment (FileService.views), so a cached redirect never points at an expired URL.
 */
const AVATAR_CACHE_SECONDS = 3600;

/** Choosing one of your uploaded pictures as your avatar. */
export function createAvatarRouter(deps: {
  files: FileService;
  avatars: AvatarWriter;
  /** Public address of the API, e.g. https://api.nexa.example.com. */
  publicUrl: string;
  guard: RequestHandler[];
}): Router {
  const { files, avatars, publicUrl, guard } = deps;
  const router = Router();

  router.put('/users/me/avatar', ...guard, validate({ body: SetAvatarBody }), async (req, res) => {
    const userId = requireAuthContext(req).userId;
    const body = req.body as SetAvatarInput;
    const file = await files.requireAvatarPicture(
      { userId, organization: organizationContext(req) },
      body.file_id,
    );
    // A new picture gets a new URL, so no browser shows a cached old avatar.
    const url = `${publicUrl}/api/v1/avatars/${file.id}`;
    await avatars.set(userId, { fileId: file.id, url });
    ok(res, { avatar_url: url });
  });

  router.delete('/users/me/avatar', ...guard, async (req, res) => {
    await avatars.set(requireAuthContext(req).userId, null);
    ok(res, { avatar_url: null });
  });

  return router;
}

/**
 * Avatar pictures for <img> tags, which can't send credentials. Only files chosen as someone's
 * avatar are served - any other upload stays private - as a redirect to a short-lived storage URL
 * the browser may cache. Mounted outside the API's global rate limit: a directory page shows
 * many avatars at once.
 */
export function createPublicAvatarRouter(deps: { files: FileService }): Router {
  const router = Router();
  router.get('/avatars/:id', validate({ params: FileParams }), async (req, res) => {
    const { id } = req.params as { id: string };
    const url = await deps.files.avatarDownloadUrl(id);
    if (!url) throw FileErrors.notFound();
    res.set('Cache-Control', `public, max-age=${AVATAR_CACHE_SECONDS}`);
    // Loaded from the web app's origin; the default same-origin policy would block the image.
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.redirect(302, url);
  });
  return router;
}
