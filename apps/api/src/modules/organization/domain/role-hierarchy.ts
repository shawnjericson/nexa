import type { SystemRoleKey } from './permissions';

export const SYSTEM_ROLE_KEYS = ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER'] as const;

const RANK: Record<string, number> = { OWNER: 4, ADMIN: 3, MANAGER: 2, MEMBER: 1 };

const rankOf = (roleKey: string) => RANK[roleKey] ?? 0;

// Privilege escalation is a P0 risk. Permissions say *what* someone may do to members; the rank
// says *to whom*: nobody can act on a peer or a superior, or hand out more power than they hold.

/** OWNERs may manage anyone (including co-owners); everybody else only lower-ranked members. */
export function canManageMember(actorRole: string, targetRole: string): boolean {
  return actorRole === 'OWNER' || rankOf(actorRole) > rankOf(targetRole);
}

/** Only OWNERs grant OWNER; everybody else may grant roles strictly below their own. */
export function canAssignRole(actorRole: string, role: SystemRoleKey): boolean {
  return actorRole === 'OWNER' || rankOf(role) < rankOf(actorRole);
}
