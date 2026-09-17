import { Router, type RequestHandler } from 'express';
import { createRateLimiter } from '../../../shared/http/rate-limit';
import { validate } from '../../../shared/http/validate';
import type { AuthService } from '../application/auth.service';
import { createAuthController } from './auth.controller';
import {
  ChangePasswordBody,
  GoogleSignInBody,
  LinkAccountBody,
  LoginBody,
  RefreshBody,
  RegisterBody,
} from './schemas';

/** /auth routes: paths, rate limits and validation. The handlers are in auth.controller.ts. */
export function createAuthRouter(deps: {
  auth: AuthService;
  requireAuth: RequestHandler;
  /** Whether "try the demo" is on (DEMO_ORG_SLUG is set). */
  demoEnabled?: boolean;
}): Router {
  const { auth, requireAuth, demoEnabled = false } = deps;
  const controller = createAuthController({ auth, demoEnabled });
  const router = Router();

  // Brute force and credential stuffing protection (risk register 4.2 and 17).
  const authLimiter = createRateLimiter({ windowMs: 15 * 60_000, limit: 20 });
  // A refresh token is a long random secret with reuse detection, so there is nothing to guess;
  // and every page load spends one. Refreshing only needs a flood guard.
  const refreshLimiter = createRateLimiter({ windowMs: 60_000, limit: 60 });
  // Every call creates an account, so this is capped per address rather than just throttled.
  const demoLimiter = createRateLimiter({ windowMs: 60 * 60_000, limit: 10 });

  router.post('/demo', demoLimiter, controller.startDemo);
  router.post('/register', authLimiter, validate({ body: RegisterBody }), controller.register);
  router.post('/login', authLimiter, validate({ body: LoginBody }), controller.login);
  router.post(
    '/oauth/google',
    authLimiter,
    validate({ body: GoogleSignInBody }),
    controller.loginWithGoogle,
  );
  router.post(
    '/oauth/link',
    authLimiter,
    validate({ body: LinkAccountBody }),
    controller.linkAccount,
  );
  router.post('/refresh', refreshLimiter, validate({ body: RefreshBody }), controller.refresh);
  router.post('/logout', validate({ body: RefreshBody }), controller.logout);
  router.post(
    '/change-password',
    authLimiter,
    requireAuth,
    validate({ body: ChangePasswordBody }),
    controller.changePassword,
  );
  return router;
}
