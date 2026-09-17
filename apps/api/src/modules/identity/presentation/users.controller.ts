import type { RequestHandler } from 'express';
import { ok } from '../../../shared/http/response';
import type { UserService } from '../application/user.service';
import { requireAuthContext } from './require-auth';
import type { UpdateMeInput, UserIdInput } from './schemas';
import { toMeResponse, toProfileResponse } from './user.dto';

/** Handlers for /users: read the request, call the user service, shape the response. */
export function createUsersController(deps: { users: UserService }) {
  const { users } = deps;

  const getMe: RequestHandler = async (req, res) => {
    ok(res, toMeResponse(await users.getMe(requireAuthContext(req))));
  };

  const updateMe: RequestHandler = async (req, res) => {
    const body = req.body as UpdateMeInput;
    const user = await users.updateMe(requireAuthContext(req), {
      username: body.username,
      displayName: body.display_name,
      avatarUrl: body.avatar_url !== undefined ? body.avatar_url : body.avatar,
      bio: body.bio,
    });
    ok(res, toMeResponse(user));
  };

  const getProfile: RequestHandler = async (req, res) => {
    const { id } = req.params as UserIdInput;
    const user = await users.getProfile(requireAuthContext(req).userId, id);
    ok(res, toProfileResponse(user));
  };

  return { getMe, updateMe, getProfile };
}
