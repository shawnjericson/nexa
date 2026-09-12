import { Router, type Request, type RequestHandler } from 'express';
import { createRateLimiter } from '../../../shared/http/rate-limit';
import { created, noContent, ok } from '../../../shared/http/response';
import { validate } from '../../../shared/http/validate';
import type { AuthService, ClientInfo } from '../application/auth.service';
import { requireAuthContext } from './require-auth';
import {
  ChangePasswordBody,
  LoginBody,
  RefreshBody,
  RegisterBody,
  type ChangePasswordInput,
  type LoginInput,
  type RefreshInput,
  type RegisterInput,
} from './schemas';
import { toMeResponse, toTokensResponse } from './user.dto';

function clientInfo(req: Request): ClientInfo {
  return { userAgent: req.get('user-agent')?.slice(0, 512), ipAddress: req.ip };
}

export function createAuthRouter(deps: { auth: AuthService; requireAuth: RequestHandler }): Router {
  const { auth, requireAuth } = deps;
  const router = Router();
  // Brute force and credential stuffing protection (risk register 4.2 and 17).
  const authLimiter = createRateLimiter({ windowMs: 15 * 60_000, limit: 20 });

  router.post('/register', authLimiter, validate({ body: RegisterBody }), async (req, res) => {
    const body = req.body as RegisterInput;
    const user = await auth.register({
      email: body.email,
      username: body.username,
      password: body.password,
      displayName: body.display_name,
    });
    created(res, toMeResponse(user));
  });

  router.post('/login', authLimiter, validate({ body: LoginBody }), async (req, res) => {
    const body = req.body as LoginInput;
    const { user, tokens } = await auth.login(body, clientInfo(req));
    ok(res, { ...toTokensResponse(tokens), user: toMeResponse(user) });
  });

  router.post('/refresh', authLimiter, validate({ body: RefreshBody }), async (req, res) => {
    const body = req.body as RefreshInput;
    const tokens = await auth.refresh(body.refresh_token, clientInfo(req));
    ok(res, toTokensResponse(tokens));
  });

  router.post('/logout', validate({ body: RefreshBody }), async (req, res) => {
    const body = req.body as RefreshInput;
    await auth.logout(body.refresh_token);
    noContent(res);
  });

  router.post(
    '/change-password',
    authLimiter,
    requireAuth,
    validate({ body: ChangePasswordBody }),
    async (req, res) => {
      const body = req.body as ChangePasswordInput;
      await auth.changePassword(requireAuthContext(req), {
        currentPassword: body.current_password,
        newPassword: body.new_password,
      });
      noContent(res);
    },
  );

  return router;
}
