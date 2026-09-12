-- Reference data: permission keys used by role-based access control.
-- Must match PERMISSION_KEYS in src/modules/organization/domain/permissions.ts (enforced by tests).
INSERT INTO "permissions" ("key", "description") VALUES
  ('organization.update', 'Update the organization profile and settings'),
  ('organization.delete', 'Delete the organization'),
  ('member.invite', 'Invite people to the organization'),
  ('member.remove', 'Remove members from the organization'),
  ('member.role.update', 'Change the role of a member'),
  ('department.manage', 'Create, update and delete departments'),
  ('post.moderate', 'Hide or delete posts and comments of other members'),
  ('announcement.publish', 'Publish announcements'),
  ('channel.create', 'Create channels'),
  ('message.moderate', 'Delete messages of other members in channels'),
  ('audit.read', 'Read the audit log');
