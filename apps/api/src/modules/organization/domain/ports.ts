import type { SystemRoleKey } from './permissions';

export interface OrganizationRepository {
  /** Returns the organization with this slug, creating it with its system roles if missing. */
  ensureOrganization(input: { slug: string; name: string }): Promise<{ id: string }>;
  /**
   * Adds the user unless they are already a member. The very first member receives
   * `roles.firstMember`, everyone after that `roles.others`.
   */
  addMember(
    organizationId: string,
    userId: string,
    roles: { firstMember: SystemRoleKey; others: SystemRoleKey },
  ): Promise<void>;
  sharesActiveOrganization(userA: string, userB: string): Promise<boolean>;
}
