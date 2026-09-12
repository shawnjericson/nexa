import type { AuthContext } from '../../modules/identity/domain/auth-context';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth for authenticated requests. */
      auth?: AuthContext;
    }
  }
}

export {};
