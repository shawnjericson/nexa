import { hasPermission, type OrganizationContext } from '../../organization';
import type { Conversation, ConversationMembership, Message } from './conversation';

/** An authenticated user acting inside one organization. */
export interface ChatActor {
  userId: string;
  organization: OrganizationContext;
}

const MANAGER_ROLES = new Set(['OWNER', 'ADMIN']);

function isManager(membership: ConversationMembership | null): boolean {
  return membership !== null && MANAGER_ROLES.has(membership.role);
}

/** Group and channel owners/admins manage members and settings; direct conversations are fixed. */
export function canManageConversation(
  conversation: Pick<Conversation, 'type'>,
  membership: ConversationMembership | null,
): boolean {
  return conversation.type !== 'DIRECT' && isManager(membership);
}

export function canEditMessage(actor: ChatActor, message: Message): boolean {
  return message.senderId === actor.userId && message.deletedAt === null && message.type === 'TEXT';
}

/**
 * The sender may always delete. In groups and channels the conversation's owners/admins may too,
 * and in channels holders of message.moderate. Nobody else ever deletes in a direct conversation
 * - organization admins included (risk register 5.4).
 */
export function canDeleteMessage(
  actor: ChatActor,
  conversation: Pick<Conversation, 'type'>,
  membership: ConversationMembership | null,
  message: Message,
): boolean {
  if (message.senderId === actor.userId) return true;
  if (conversation.type === 'DIRECT') return false;
  if (isManager(membership)) return true;
  return conversation.type === 'CHANNEL' && hasPermission(actor.organization, 'message.moderate');
}
