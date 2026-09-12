import type { PermissionKey } from './permissions';

/** The organization a request acts in, resolved from the caller's membership on every request. */
export interface OrganizationContext {
  organizationId: string;
  membershipId: string;
  roleKey: string;
  permissions: ReadonlySet<string>;
}

/** An authenticated user acting inside one organization. */
export interface OrganizationActor {
  userId: string;
  organization: OrganizationContext;
}

export function hasPermission(context: OrganizationContext, permission: PermissionKey): boolean {
  return context.permissions.has(permission);
}
