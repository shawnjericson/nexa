/**
 * The API's system roles and what they allow (mirrors organization/domain/permissions.ts and
 * role-hierarchy.ts in apps/api). The web app uses this only to decide what to show; the API
 * enforces every permission itself.
 */
export type Permission =
  | 'organization.update'
  | 'organization.delete'
  | 'member.invite'
  | 'member.remove'
  | 'member.role.update'
  | 'department.manage'
  | 'post.moderate'
  | 'announcement.publish'
  | 'channel.create'
  | 'message.moderate'
  | 'audit.read';

export const ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER'] as const;
export type Role = (typeof ROLES)[number];

const ALL: readonly Permission[] = [
  'organization.update',
  'organization.delete',
  'member.invite',
  'member.remove',
  'member.role.update',
  'department.manage',
  'post.moderate',
  'announcement.publish',
  'channel.create',
  'message.moderate',
  'audit.read',
];

const PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: ALL,
  ADMIN: ALL.filter((key) => key !== 'organization.delete'),
  MANAGER: ['member.invite', 'post.moderate', 'announcement.publish', 'channel.create'],
  MEMBER: ['channel.create'],
};

const RANK: Record<string, number> = { OWNER: 4, ADMIN: 3, MANAGER: 2, MEMBER: 1 };
const rankOf = (role: string) => RANK[role] ?? 0;

export const isRole = (value: string): value is Role =>
  (ROLES as readonly string[]).includes(value);

export function can(role: string, permission: Permission): boolean {
  return isRole(role) && PERMISSIONS[role].includes(permission);
}

/** Permissions that give the admin area something to show. */
const ADMIN_PERMISSIONS: readonly Permission[] = [
  'member.invite',
  'member.remove',
  'member.role.update',
  'department.manage',
  'audit.read',
  'organization.update',
];

export function canAdminister(role: string): boolean {
  return ADMIN_PERMISSIONS.some((permission) => can(role, permission));
}

/** OWNERs may manage anyone (co-owners included); everybody else only lower-ranked members. */
export function canManageMember(actorRole: string, targetRole: string): boolean {
  return actorRole === 'OWNER' || rankOf(actorRole) > rankOf(targetRole);
}

/** Only OWNERs grant OWNER; everybody else may grant roles strictly below their own. */
export function canAssignRole(actorRole: string, role: string): boolean {
  return actorRole === 'OWNER' || rankOf(role) < rankOf(actorRole);
}
