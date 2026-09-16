import { hasPermission, type OrganizationContext } from '../../organization';
import type { Conversation, ConversationMembership, Message } from './conversation';

/** An authenticated user acting inside one organization. */
export interface ChatActor {
  userId: string;
  organization: OrganizationContext;
}

const MANAGER_ROLES = new Set(['OWNER', 'ADMIN']);

/**
 * How long the sender may still change their own message. Long enough to fix a typo, short
 * enough that nobody rewrites a conversation someone has already acted on. Moderators are not
 * bound by it: removing something harmful has to stay possible at any time.
 */
export const MESSAGE_CHANGE_WINDOW_MINUTES = 15;
export const MESSAGE_CHANGE_WINDOW_MS = MESSAGE_CHANGE_WINDOW_MINUTES * 60_000;

export function withinChangeWindow(message: Pick<Message, 'createdAt'>, now: Date): boolean {
  return now.getTime() - message.createdAt.getTime() <= MESSAGE_CHANGE_WINDOW_MS;
}

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

/** Whether this is the actor's message at all; the time limit is checked separately. */
export function canEditMessage(actor: ChatActor, message: Message): boolean {
  return message.senderId === actor.userId && message.deletedAt === null && message.type === 'TEXT';
}

/**
 * Who may remove other people's messages: owners and admins of a group or channel, and holders of
 * message.moderate in a channel. Nobody ever moderates a direct conversation - organization
 * admins included (risk register 5.4).
 */
export function canModerateMessages(
  actor: ChatActor,
  conversation: Pick<Conversation, 'type'>,
  membership: ConversationMembership | null,
): boolean {
  if (conversation.type === 'DIRECT') return false;
  if (isManager(membership)) return true;
  return conversation.type === 'CHANNEL' && hasPermission(actor.organization, 'message.moderate');
}

/**
 * The sender may delete their own message, moderators anyone's. Only the sender is held to the
 * change window: taking down something harmful has to stay possible however old it is.
 */
export function canDeleteMessage(
  actor: ChatActor,
  conversation: Pick<Conversation, 'type'>,
  membership: ConversationMembership | null,
  message: Message,
): boolean {
  return message.senderId === actor.userId || canModerateMessages(actor, conversation, membership);
}
