import type { DomainEvent } from '../../../shared/events/event-bus';

export const ORGANIZATION_CREATED = 'organization.created';
export const MEMBER_INVITED = 'organization.member_invited';
export const MEMBER_JOINED = 'organization.member_joined';
export const MEMBER_UPDATED = 'organization.member_updated';
export const MEMBER_REMOVED = 'organization.member_removed';

export type OrganizationCreatedEvent = DomainEvent<typeof ORGANIZATION_CREATED, { slug: string }>;

export type MemberInvitedEvent = DomainEvent<
  typeof MEMBER_INVITED,
  { invitation_id: string; email: string; role: string }
>;

export type MemberJoinedEvent = DomainEvent<
  typeof MEMBER_JOINED,
  { role: string; via: 'invitation' }
>;

export type MemberUpdatedEvent = DomainEvent<
  typeof MEMBER_UPDATED,
  { previous_role: string; role: string; previous_status: string; status: string }
>;

export type MemberRemovedEvent = DomainEvent<typeof MEMBER_REMOVED, { left: boolean }>;
