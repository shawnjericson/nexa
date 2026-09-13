import { describe, expect, it } from 'vitest';
import { can, canAdminister, canAssignRole, canManageMember } from './permissions';

describe('permissions', () => {
  it('mirrors the API roles', () => {
    expect(can('OWNER', 'organization.delete')).toBe(true);
    expect(can('ADMIN', 'organization.delete')).toBe(false);
    expect(can('ADMIN', 'audit.read')).toBe(true);
    expect(can('MANAGER', 'member.invite')).toBe(true);
    expect(can('MANAGER', 'member.remove')).toBe(false);
    expect(can('MEMBER', 'channel.create')).toBe(true);
    expect(can('SOMETHING_ELSE', 'channel.create')).toBe(false);
  });

  it('opens the admin area to anyone with an administrative permission', () => {
    expect(canAdminister('OWNER')).toBe(true);
    expect(canAdminister('MANAGER')).toBe(true);
    expect(canAdminister('MEMBER')).toBe(false);
  });

  it('lets people act only on lower ranks, except owners', () => {
    expect(canManageMember('ADMIN', 'MANAGER')).toBe(true);
    expect(canManageMember('ADMIN', 'ADMIN')).toBe(false);
    expect(canManageMember('OWNER', 'OWNER')).toBe(true);
    expect(canAssignRole('ADMIN', 'MANAGER')).toBe(true);
    expect(canAssignRole('ADMIN', 'ADMIN')).toBe(false);
    expect(canAssignRole('OWNER', 'OWNER')).toBe(true);
  });
});
