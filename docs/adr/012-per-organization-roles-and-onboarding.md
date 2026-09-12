# ADR-012: Per-organization roles and default-organization onboarding

- Status: Accepted
- Date: 2026-09-12

## Context

The spec lists the roles OWNER, ADMIN, MANAGER and MEMBER backed by explicit permissions
(`member.invite`, `post.moderate`, ...). The exam's registration flow has no organization at all,
but every NEXA resource is tenant-scoped. Two risks from the register matter here:
cross-tenant role assignment (privilege escalation, P0), and stale permissions in long-lived
tokens (4.4).

## Decision

1. **Roles belong to an organization** (`roles.organization_id NOT NULL`). Every new organization
   receives copies of the four system roles in the same write that creates it. Permissions are
   global reference data seeded by migrations, and `role_permissions` maps roles to them. This
   leaves room for custom roles per organization later without nullable-tenant special cases.
2. **Composite foreign key** from `organization_members(role_id, organization_id)` to
   `roles(id, organization_id)`: the database itself rejects assigning a role from another
   organization, whatever the application code does.
3. **Permissions are never embedded in the JWT.** The access token carries only `sub` and `sid`;
   effective permissions are resolved server-side per request (organization-context middleware,
   Phase 3), so role changes and removals take effect immediately.
4. **Onboarding:** `identity.user_registered` is handled by the Organization module, which adds
   the user to `DEFAULT_ORG_SLUG`. The **first member becomes OWNER** so a fresh deployment is
   administrable; everyone after that becomes MEMBER. Joins take a row lock on the organization,
   so two simultaneous "first" registrations cannot both become owner.
5. **Profile visibility:** `GET /users/:id` succeeds only for users who share an active
   organization with the caller. Everyone else gets the same 404 as a missing id, so ids cannot be
   probed. Identity asks through a `ProfileVisibility` port implemented by Organization, which keeps
   the dependency direction Identity → Organization intact.

## Consequences

- Changing the permissions of system roles for existing organizations requires a data migration.
- **Production:** create the default organization and its owner (seed or admin action) before
  opening public registration. Otherwise the first stranger to register becomes OWNER.
- Invitations will replace default-organization auto-join for multi-company deployments.
