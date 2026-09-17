import type { SearchQuery } from '../../../shared/search/search-query';
import type { Invitation } from './invitation';
import type { SystemRoleKey } from './permissions';

export type MembershipStatus = 'ACTIVE' | 'SUSPENDED';

export interface MembershipRecord {
  membershipId: string;
  organizationId: string;
  status: MembershipStatus;
  roleKey: string;
  permissions: string[];
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationWithMembership extends Organization {
  roleKey: string;
  membershipStatus: MembershipStatus;
  joinedAt: Date;
}

export interface OrganizationChanges {
  name?: string;
  logoUrl?: string | null;
  timezone?: string;
}

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
  /** The user's memberships (optionally within one organization), oldest first, at most `limit`. */
  findMemberships(
    userId: string,
    options: { organizationId?: string; limit: number },
  ): Promise<MembershipRecord[]>;
  findById(id: string): Promise<Organization | null>;
  countMembers(organizationId: string): Promise<number>;
  listForUser(userId: string): Promise<OrganizationWithMembership[]>;
  /**
   * Creates the organization, its system roles and the creator's OWNER membership atomically.
   * Throws OrganizationErrors.slugTaken on a slug conflict.
   */
  createWithOwner(
    input: { name: string; slug: string; timezone?: string },
    ownerId: string,
  ): Promise<Organization>;
  update(id: string, changes: OrganizationChanges): Promise<Organization>;
}

export interface Member {
  membershipId: string;
  userId: string;
  roleKey: string;
  status: MembershipStatus;
  joinedAt: Date;
}

export interface MemberChange {
  role?: SystemRoleKey;
  status?: MembershipStatus;
}

/** Member operations inside one organization while its row is locked (see runLocked). */
export interface LockedMembers {
  find(userId: string): Promise<Member | null>;
  countActiveOwners(): Promise<number>;
  update(membershipId: string, change: MemberChange): Promise<Member>;
  remove(membershipId: string): Promise<void>;
}

export interface MemberFilter {
  /** Name or username prefixes, as a tsquery (see shared/search/search-query). */
  query?: SearchQuery;
  departmentId?: string | 'none';
  sort: 'joined' | 'newest' | 'name';
}

export interface MembershipRepository {
  listMembers(
    organizationId: string,
    window: { skip: number; take: number },
    filter: MemberFilter,
  ): Promise<{ items: Member[]; total: number }>;
  findMember(organizationId: string, userId: string): Promise<Member | null>;
  /**
   * Runs `work` in a transaction that holds a lock on the organization row, so membership
   * changes are serialized - e.g. two owners demoting each other can't leave zero owners.
   */
  runLocked<T>(organizationId: string, work: (members: LockedMembers) => Promise<T>): Promise<T>;
}

export interface NewInvitation {
  organizationId: string;
  email: string;
  roleKey: SystemRoleKey;
  tokenHash: string;
  invitedById: string;
  expiresAt: Date;
}

export type AcceptOutcome = 'ACCEPTED' | 'UNAVAILABLE' | 'ALREADY_MEMBER';

export interface InvitationRepository {
  /** Revokes any pending invitation for the same email, then stores the new one - atomically. */
  replacePending(invitation: NewInvitation, at: Date): Promise<Invitation>;
  listPending(organizationId: string, at: Date): Promise<Invitation[]>;
  findByTokenHash(tokenHash: string): Promise<Invitation | null>;
  /** Returns false when there was no pending invitation with this id. */
  revoke(organizationId: string, id: string, at: Date): Promise<boolean>;
  /** Consumes the invitation and creates the membership in one transaction. */
  accept(invitationId: string, userId: string, at: Date): Promise<AcceptOutcome>;
}

export interface Department {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DepartmentChanges {
  name?: string;
  slug?: string;
  description?: string | null;
}

/** Scoped by organization. */
export interface DepartmentRef {
  id: string;
  name: string;
}

export interface DepartmentRepository {
  list(organizationId: string): Promise<Department[]>;
  findById(organizationId: string, id: string): Promise<Department | null>;
  /** Throws OrganizationErrors.departmentExists on a slug conflict. */
  create(department: {
    organizationId: string;
    name: string;
    slug: string;
    description: string | null;
  }): Promise<Department>;
  /** Returns null when the department doesn't exist; throws departmentExists on a slug conflict. */
  update(
    organizationId: string,
    id: string,
    changes: DepartmentChanges,
  ): Promise<Department | null>;
  delete(organizationId: string, id: string): Promise<boolean>;
  listMemberIds(organizationId: string, departmentId: string): Promise<string[]>;
  /** The departments each of these people is in (people in none are left out of the map). */
  departmentsOf(
    organizationId: string,
    userIds: readonly string[],
  ): Promise<Map<string, DepartmentRef[]>>;
  /** Idempotent. */
  addMember(organizationId: string, departmentId: string, userId: string): Promise<void>;
  /** Idempotent. */
  removeMember(organizationId: string, departmentId: string, userId: string): Promise<void>;
}
