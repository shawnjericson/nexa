export type InvitationState = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

export interface Invitation {
  id: string;
  organizationId: string;
  email: string;
  roleKey: string;
  invitedById: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export function invitationState(invitation: Invitation, now: Date): InvitationState {
  if (invitation.acceptedAt) return 'ACCEPTED';
  if (invitation.revokedAt) return 'REVOKED';
  if (invitation.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  return 'PENDING';
}
