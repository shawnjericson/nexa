import { Router, type RequestHandler } from 'express';
import { ok } from '../../../shared/http/response';
import { validate } from '../../../shared/http/validate';
import type { UserService } from '../application/user.service';
import { requireAuthContext } from './require-auth';
import { UpdateMeBody, UserIdParams, type UpdateMeInput, type UserIdInput } from './schemas';
import { toMeResponse, toProfileResponse } from './user.dto';

export function createUsersRouter(deps: {
  users: UserService;
  requireAuth: RequestHandler;
}): Router {
  const { users, requireAuth } = deps;
  const router = Router();
  router.use(requireAuth);

  router.get('/me', async (req, res) => {
    ok(res, toMeResponse(await users.getMe(requireAuthContext(req))));
  });

  router.put('/me', validate({ body: UpdateMeBody }), async (req, res) => {
    const body = req.body as UpdateMeInput;
    const user = await users.updateMe(requireAuthContext(req), {
      username: body.username,
      displayName: body.display_name,
      avatarUrl: body.avatar_url !== undefined ? body.avatar_url : body.avatar,
      bio: body.bio,
    });
    ok(res, toMeResponse(user));
  });

  router.get('/:id', validate({ params: UserIdParams }), async (req, res) => {
    const { id } = req.params as UserIdInput;
    const user = await users.getProfile(requireAuthContext(req).userId, id);
    ok(res, toProfileResponse(user));
  });

  return router;
}
