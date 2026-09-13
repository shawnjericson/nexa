import { createEvent, type EventBus } from '../../../shared/events/event-bus';
import { slugify } from '../../../shared/utils/slug';
import {
  ORGANIZATION_CREATED,
  ORGANIZATION_UPDATED,
  type OrganizationCreatedEvent,
  type OrganizationUpdatedEvent,
} from '../domain/events';
import type { OrganizationActor } from '../domain/organization-context';
import { OrganizationErrors } from '../domain/organization-errors';
import type {
  Organization,
  OrganizationChanges,
  OrganizationRepository,
  OrganizationWithMembership,
} from '../domain/ports';

export const ORGANIZATION_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/;

export interface OrganizationDetails {
  organization: Organization;
  memberCount: number;
  myRole: string;
}

export class OrganizationManagementService {
  constructor(private readonly deps: { organizations: OrganizationRepository; events: EventBus }) {}

  /** The caller's organizations, e.g. for an organization switcher (spec 5.3). */
  listMine(userId: string): Promise<OrganizationWithMembership[]> {
    return this.deps.organizations.listForUser(userId);
  }

  /** Anyone signed in may create an organization; they become its first OWNER. */
  async create(
    userId: string,
    input: { name: string; slug?: string; timezone?: string },
  ): Promise<Organization> {
    const slug = input.slug ?? slugify(input.name);
    if (!ORGANIZATION_SLUG.test(slug)) throw OrganizationErrors.invalidSlug();

    const organization = await this.deps.organizations.createWithOwner(
      { name: input.name, slug, timezone: input.timezone },
      userId,
    );

    const event: OrganizationCreatedEvent = createEvent(ORGANIZATION_CREATED, {
      organization_id: organization.id,
      actor_id: userId,
      subject_id: organization.id,
      metadata: { slug },
    });
    await this.deps.events.publish(event);
    return organization;
  }

  async get(actor: OrganizationActor): Promise<OrganizationDetails> {
    const id = actor.organization.organizationId;
    const [organization, memberCount] = await Promise.all([
      this.deps.organizations.findById(id),
      this.deps.organizations.countMembers(id),
    ]);
    if (!organization) throw OrganizationErrors.notAMember();
    return { organization, memberCount, myRole: actor.organization.roleKey };
  }

  async update(actor: OrganizationActor, changes: OrganizationChanges): Promise<Organization> {
    const organization = await this.deps.organizations.update(
      actor.organization.organizationId,
      changes,
    );

    const event: OrganizationUpdatedEvent = createEvent(ORGANIZATION_UPDATED, {
      organization_id: organization.id,
      actor_id: actor.userId,
      subject_id: organization.id,
      metadata: {
        fields: Object.entries(changes)
          .filter(([, value]) => value !== undefined)
          .map(([field]) => field),
      },
    });
    await this.deps.events.publish(event);
    return organization;
  }
}
