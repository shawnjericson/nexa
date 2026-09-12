import type { PermissionKey } from './permissions';

/** The organization a request acts in, resolved from the caller's membership on every request. */
export interface OrganizationContext {
  organizationId: string;
  membershipId: string;
  roleKey: string;
  permissions: ReadonlySet<string>;
}

export function hasPermission(context: OrganizationContext, permission: PermissionKey): boolean {
  return context.permissions.has(permission);
}
