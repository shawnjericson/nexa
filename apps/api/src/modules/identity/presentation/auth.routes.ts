import { Router, type Request, type RequestHandler } from 'express';
import { createRateLimiter } from '../../../shared/http/rate-limit';
import { created, noContent, ok } from '../../../shared/http/response';
import { validate } from '../../../shared/http/validate';
import type { AuthService, ClientInfo } from '../application/auth.service';
import { requireAuthContext } from './require-auth';
import {
  ChangePasswordBody,
  GoogleSignInBody,
  LinkAccountBody,
  LoginBody,
  RefreshBody,
  RegisterBody,
  type ChangePasswordInput,
  type GoogleSignInInput,
  type LinkAccountInput,
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
  // A refresh token is a long random secret with reuse detection, so there is nothing to guess;
  // and every page load spends one. Refreshing only needs a flood guard.
  const refreshLimiter = createRateLimiter({ windowMs: 60_000, limit: 60 });

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

  // Sign-in with Google (ADR-020). The web server runs the OAuth redirect flow and sends the
  // resulting ID token here; the API verifies it itself.
  router.post(
    '/oauth/google',
    authLimiter,
    validate({ body: GoogleSignInBody }),
    async (req, res) => {
      const body = req.body as GoogleSignInInput;
      const result = await auth.loginWithExternal(body.id_token, body.nonce, clientInfo(req));
      ok(res, {
        ...toTokensResponse(result.tokens),
        user: toMeResponse(result.user),
        created: result.created,
      });
    },
  );

  router.post('/oauth/link', authLimiter, validate({ body: LinkAccountBody }), async (req, res) => {
    const body = req.body as LinkAccountInput;
    const { user, tokens } = await auth.linkExternal(
      body.link_token,
      body.password,
      clientInfo(req),
    );
    ok(res, { ...toTokensResponse(tokens), user: toMeResponse(user) });
  });

  router.post('/refresh', refreshLimiter, validate({ body: RefreshBody }), async (req, res) => {
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
