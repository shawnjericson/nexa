import type { Request, RequestHandler } from 'express';
import { created, noContent, ok } from '../../../shared/http/response';
import type { AuthService, ClientInfo } from '../application/auth.service';
import { IdentityErrors } from '../domain/identity-errors';
import { requireAuthContext } from './require-auth';
import type {
  ChangePasswordInput,
  GoogleSignInInput,
  LinkAccountInput,
  LoginInput,
  RefreshInput,
  RegisterInput,
} from './schemas';
import { toMeResponse, toTokensResponse } from './user.dto';

function clientInfo(req: Request): ClientInfo {
  return { userAgent: req.get('user-agent')?.slice(0, 512), ipAddress: req.ip };
}

/**
 * Handlers for /auth: each reads a validated request, calls the auth service and shapes the
 * response. Paths, rate limits and validation are the router's business (auth.routes.ts).
 */
export function createAuthController(deps: {
  auth: AuthService;
  /** Whether "try the demo" is on (DEMO_ORG_SLUG is set). */
  demoEnabled: boolean;
}) {
  const { auth, demoEnabled } = deps;

  const startDemo: RequestHandler = async (req, res) => {
    if (!demoEnabled) throw IdentityErrors.demoUnavailable();
    const { user, tokens } = await auth.startDemo(clientInfo(req));
    created(res, { ...toTokensResponse(tokens), user: toMeResponse(user) });
  };

  const register: RequestHandler = async (req, res) => {
    const body = req.body as RegisterInput;
    const user = await auth.register({
      email: body.email,
      username: body.username,
      password: body.password,
      displayName: body.display_name,
    });
    created(res, toMeResponse(user));
  };

  const login: RequestHandler = async (req, res) => {
    const body = req.body as LoginInput;
    const { user, tokens } = await auth.login(body, clientInfo(req));
    ok(res, { ...toTokensResponse(tokens), user: toMeResponse(user) });
  };

  // Sign-in with Google (ADR-020). The web server runs the OAuth redirect flow and sends the
  // resulting ID token here; the API verifies it itself.
  const loginWithGoogle: RequestHandler = async (req, res) => {
    const body = req.body as GoogleSignInInput;
    const result = await auth.loginWithExternal(body.id_token, body.nonce, clientInfo(req));
    ok(res, {
      ...toTokensResponse(result.tokens),
      user: toMeResponse(result.user),
      created: result.created,
    });
  };

  const linkAccount: RequestHandler = async (req, res) => {
    const body = req.body as LinkAccountInput;
    const { user, tokens } = await auth.linkExternal(
      body.link_token,
      body.password,
      clientInfo(req),
    );
    ok(res, { ...toTokensResponse(tokens), user: toMeResponse(user) });
  };

  const refresh: RequestHandler = async (req, res) => {
    const body = req.body as RefreshInput;
    const tokens = await auth.refresh(body.refresh_token, clientInfo(req));
    ok(res, toTokensResponse(tokens));
  };

  const logout: RequestHandler = async (req, res) => {
    const body = req.body as RefreshInput;
    await auth.logout(body.refresh_token);
    noContent(res);
  };

  const changePassword: RequestHandler = async (req, res) => {
    const body = req.body as ChangePasswordInput;
    await auth.changePassword(requireAuthContext(req), {
      currentPassword: body.current_password,
      newPassword: body.new_password,
    });
    noContent(res);
  };

  return {
    startDemo,
    register,
    login,
    loginWithGoogle,
    linkAccount,
    refresh,
    logout,
    changePassword,
  };
}
