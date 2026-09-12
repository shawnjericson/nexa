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
}
