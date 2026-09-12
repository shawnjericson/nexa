/**
 * Permission keys. The permissions table is seeded with exactly these keys by migrations
 * (a test keeps the two in sync).
 */
export const PERMISSION_KEYS = [
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
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type SystemRoleKey = 'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER';

export interface SystemRole {
  key: SystemRoleKey;
  name: string;
  permissions: readonly PermissionKey[];
}

/** Created for every organization. Ownership is the only thing ADMIN cannot do. */
export const SYSTEM_ROLES: readonly SystemRole[] = [
  { key: 'OWNER', name: 'Owner', permissions: PERMISSION_KEYS },
  {
    key: 'ADMIN',
    name: 'Admin',
    permissions: PERMISSION_KEYS.filter((key) => key !== 'organization.delete'),
  },
  {
    key: 'MANAGER',
    name: 'Manager',
    permissions: ['member.invite', 'post.moderate', 'announcement.publish', 'channel.create'],
  },
  { key: 'MEMBER', name: 'Member', permissions: ['channel.create'] },
];
