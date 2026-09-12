import type { OrganizationContext } from '../domain/organization-context';
import { OrganizationErrors } from '../domain/organization-errors';
import type { OrganizationRepository } from '../domain/ports';

export class OrganizationService {
  constructor(
    private readonly deps: {
      organizations: OrganizationRepository;
      defaultOrganization: { slug: string; name: string };
    },
  ) {}

  /** ADR-010: self-registered users join the default organization; its first member owns it. */
  async joinDefaultOrganization(userId: string): Promise<void> {
    const organization = await this.deps.organizations.ensureOrganization(
      this.deps.defaultOrganization,
    );
    await this.deps.organizations.addMember(organization.id, userId, {
      firstMember: 'OWNER',
      others: 'MEMBER',
    });
  }

  sharesOrganization(userA: string, userB: string): Promise<boolean> {
    return this.deps.organizations.sharesActiveOrganization(userA, userB);
  }

  /**
   * Resolves the organization a request acts in (spec section 15:
   * JWT -> user -> membership -> organization -> permission check).
   * The client may pick an organization, but never one it doesn't belong to.
   */
  async resolveContext(
    userId: string,
    requestedOrganizationId?: string,
  ): Promise<OrganizationContext> {
    const memberships = await this.deps.organizations.findMemberships(userId, {
      organizationId: requestedOrganizationId,
      limit: requestedOrganizationId ? 1 : 2,
    });
    const [membership] = memberships;

    if (!membership) {
      throw requestedOrganizationId
        ? OrganizationErrors.notAMember()
        : OrganizationErrors.noOrganization();
    }
    if (!requestedOrganizationId && memberships.length > 1) {
      throw OrganizationErrors.contextRequired();
    }
    // Suspended members lose all access to the organization, reads included.
    if (membership.status !== 'ACTIVE') throw OrganizationErrors.membershipSuspended();

    return {
      organizationId: membership.organizationId,
      membershipId: membership.membershipId,
      roleKey: membership.roleKey,
      permissions: new Set(membership.permissions),
    };
  }
}
