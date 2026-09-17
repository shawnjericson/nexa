import type { RequestHandler } from 'express';
import { isGuestEmail } from '../domain/guest';
import { IdentityErrors } from '../domain/identity-errors';
import type { UserSummary } from '../domain/ports';
import { requireAuthContext } from './require-auth';

/**
 * For routes a demo guest may not use. A guest is there to look around the demo; creating
 * workspaces of their own, or putting files in storage somebody pays for, takes a real account.
 * Mounted after requireAuth.
 */
export function createForbidGuests(users: {
  findSummaries(ids: readonly string[]): Promise<UserSummary[]>;
}): RequestHandler {
  return async (req, _res, next) => {
    const { userId } = requireAuthContext(req);
    const [me] = await users.findSummaries([userId]);
    if (me && isGuestEmail(me.email)) throw IdentityErrors.guestNotAllowed();
    next();
  };
}
