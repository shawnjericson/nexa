import type { DomainEvent } from '../../../shared/events/event-bus';

export const ORGANIZATION_CREATED = 'organization.created';
export const ORGANIZATION_UPDATED = 'organization.updated';
export const MEMBER_INVITED = 'organization.member_invited';
export const MEMBER_JOINED = 'organization.member_joined';
export const MEMBER_UPDATED = 'organization.member_updated';
export const MEMBER_REMOVED = 'organization.member_removed';
export const DEPARTMENT_CREATED = 'organization.department_created';
export const DEPARTMENT_DELETED = 'organization.department_deleted';

export type OrganizationCreatedEvent = DomainEvent<typeof ORGANIZATION_CREATED, { slug: string }>;

export type OrganizationUpdatedEvent = DomainEvent<
  typeof ORGANIZATION_UPDATED,
  { fields: string[] }
>;

export type MemberInvitedEvent = DomainEvent<
  typeof MEMBER_INVITED,
  { invitation_id: string; email: string; role: string }
>;

export type MemberJoinedEvent = DomainEvent<
  typeof MEMBER_JOINED,
  { role: string; via: 'invitation' | 'demo' }
>;

export type MemberUpdatedEvent = DomainEvent<
  typeof MEMBER_UPDATED,
  { previous_role: string; role: string; previous_status: string; status: string }
>;

export type MemberRemovedEvent = DomainEvent<typeof MEMBER_REMOVED, { left: boolean }>;

export type DepartmentCreatedEvent = DomainEvent<typeof DEPARTMENT_CREATED, { name: string }>;

export type DepartmentDeletedEvent = DomainEvent<typeof DEPARTMENT_DELETED, { name: string }>;
