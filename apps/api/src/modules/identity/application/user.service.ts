import type { AuthContext } from '../domain/auth-context';
import { IdentityErrors } from '../domain/identity-errors';
import type { ProfileVisibility, UpdateProfileData, UserRepository } from '../domain/ports';
import type { User } from '../domain/user';

export class UserService {
  constructor(private readonly deps: { users: UserRepository; visibility: ProfileVisibility }) {}

  async getMe(auth: AuthContext): Promise<User> {
    const user = await this.deps.users.findById(auth.userId);
    if (!user) throw IdentityErrors.userNotFound();
    return user;
  }

  /**
   * Profiles are visible to people who share an organization. Everyone else gets the same 404
   * as for a missing id, so user ids can't be probed (risk register 5.2).
   */
  async getProfile(viewerId: string, targetId: string): Promise<User> {
    const visible =
      viewerId === targetId || (await this.deps.visibility.canView(viewerId, targetId));
    const user = visible ? await this.deps.users.findById(targetId) : null;
    if (!user) throw IdentityErrors.userNotFound();
    return user;
  }

  updateMe(auth: AuthContext, data: UpdateProfileData): Promise<User> {
    return this.deps.users.updateProfile(auth.userId, data);
  }
}
