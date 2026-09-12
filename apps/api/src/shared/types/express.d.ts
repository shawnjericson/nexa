import type { AuthContext } from '../../modules/identity/domain/auth-context';
import type { OrganizationContext } from '../../modules/organization/domain/organization-context';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth for authenticated requests. */
      auth?: AuthContext;
      /** Set by requireOrganization: the organization this request acts in. */
      organization?: OrganizationContext;
    }
  }
}

export {};
