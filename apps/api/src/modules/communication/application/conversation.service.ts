import { createEvent, type EventBus } from '../../../shared/events/event-bus';
import { slugify } from '../../../shared/utils/slug';
import { hasPermission, type OrganizationDirectory } from '../../organization';
import { ChatErrors } from '../domain/chat-errors';
import {
  directKeyOf,
  type Conversation,
  type ConversationMembership,
  type Message,
} from '../domain/conversation';
import {
  CONVERSATION_CREATED,
  CONVERSATION_READ,
  type ConversationCreatedEvent,
} from '../domain/events';
import { canManageConversation, type ChatActor } from '../domain/policies';
import type {
  ActivityCursor,
  ChannelListing,
  ChatRealtime,
  ConversationRepository,
  MessageRepository,
  NewConversation,
} from '../domain/ports';

export interface ConversationAccess {
  conversation: Conversation;
  membership: ConversationMembership | null;
}

export interface MemberAccess {
  conversation: Conversation;
  membership: ConversationMembership;
}

export interface ConversationSummary {
  conversation: Conversation;
  membership: ConversationMembership;
  lastMessage: Message | null;
  directPeerId: string | null;
  memberCount: number;
}

export interface ConversationDetails extends ConversationAccess {
  members: ConversationMembership[];
  directPeerId: string | null;
}

export class ConversationService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      conversations: ConversationRepository;
      messages: MessageRepository;
      directory: OrganizationDirectory;
      realtime: ChatRealtime;
      events: EventBus;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  async list(
    actor: ChatActor,
    options: { limit: number; after?: ActivityCursor },
  ): Promise<{ items: ConversationSummary[]; hasMore: boolean }> {
    const rows = await this.deps.conversations.listForUser(
      actor.organization.organizationId,
      actor.userId,
      { take: options.limit + 1, after: options.after },
    );
    const page = rows.slice(0, options.limit);

    const [lastMessages, peers, counts] = await Promise.all([
      this.deps.messages.findBySeqs(
        page
          .filter(({ conversation }) => conversation.lastMessageSeq > 0)
          .map(({ conversation }) => ({
            conversationId: conversation.id,
            seq: conversation.lastMessageSeq,
          })),
      ),
      this.deps.conversations.directPeers(
        page
          .filter(({ conversation }) => conversation.type === 'DIRECT')
          .map(({ conversation }) => conversation.id),
        actor.userId,
      ),
      this.deps.conversations.countMembers(page.map(({ conversation }) => conversation.id)),
    ]);
    const lastByConversation = new Map(
      lastMessages.map((message) => [message.conversationId, message]),
    );

    return {
      hasMore: rows.length > options.limit,
      items: page.map(({ conversation, membership }) => ({
        conversation,
        membership,
        lastMessage: lastByConversation.get(conversation.id) ?? null,
        directPeerId: peers.get(conversation.id) ?? null,
        memberCount: counts.get(conversation.id) ?? 0,
      })),
    };
  }

  browseChannels(actor: ChatActor): Promise<ChannelListing[]> {
    return this.deps.conversations.listChannels(actor.organization.organizationId, actor.userId);
  }

  /** Idempotent: a pair of people has one direct conversation, whoever opens it first. */
  async openDirect(
    actor: ChatActor,
    peerId: string,
  ): Promise<{ conversation: Conversation; created: boolean }> {
    if (peerId === actor.userId) throw ChatErrors.invalidDirectPeer();
    await this.requireActiveMembers(actor, [peerId]);

    const organizationId = actor.organization.organizationId;
    const key = directKeyOf(actor.userId, peerId);
    const existing = await this.deps.conversations.findDirect(organizationId, key);
    if (existing) return { conversation: existing, created: false };

    const conversation = await this.create(actor, {
      type: 'DIRECT',
      name: null,
      description: null,
      slug: null,
      directKey: key,
      members: [
        { userId: actor.userId, role: 'MEMBER' },
        { userId: peerId, role: 'MEMBER' },
      ],
    });
    if (conversation) return { conversation, created: true };

    // The other person opened it at the same moment.
    const raced = await this.deps.conversations.findDirect(organizationId, key);
    if (!raced) throw new Error('Direct conversation vanished after a unique conflict');
    return { conversation: raced, created: false };
  }

  async createGroup(
    actor: ChatActor,
    input: { name: string; memberIds: string[] },
  ): Promise<Conversation> {
    const memberIds = [...new Set(input.memberIds)].filter((id) => id !== actor.userId);
    await this.requireActiveMembers(actor, memberIds);
    const conversation = await this.create(actor, {
      type: 'GROUP',
      name: input.name,
      description: null,
      slug: null,
      directKey: null,
      members: [
        { userId: actor.userId, role: 'OWNER' },
        ...memberIds.map((userId) => ({ userId, role: 'MEMBER' as const })),
      ],
    });
    if (!conversation) throw new Error('Group creation returned no conversation');
    return conversation;
  }

  async createChannel(
    actor: ChatActor,
    input: { name: string; description?: string | null },
  ): Promise<Conversation> {
    if (!hasPermission(actor.organization, 'channel.create')) {
      throw ChatErrors.channelCreateForbidden();
    }
    const conversation = await this.create(actor, {
      type: 'CHANNEL',
      name: input.name,
      description: input.description ?? null,
      slug: channelSlug(input.name),
      directKey: null,
      members: [{ userId: actor.userId, role: 'OWNER' }],
    });
    if (!conversation) throw new Error('Channel creation returned no conversation');
    return conversation;
  }

  async get(actor: ChatActor, id: string): Promise<ConversationDetails> {
    const access = await this.access(actor, id);
    const members = await this.deps.conversations.listMemberships(access.conversation.id);
    const directPeerId =
      access.conversation.type === 'DIRECT'
        ? (members.find((member) => member.userId !== actor.userId)?.userId ?? null)
        : null;
    return { ...access, members, directPeerId };
  }

  async update(
    actor: ChatActor,
    id: string,
    changes: { name?: string; description?: string | null; archived?: boolean },
  ): Promise<Conversation> {
    const { conversation, membership } = await this.access(actor, id);
    if (conversation.type === 'DIRECT') throw ChatErrors.directConversationFixed();
    if (!canManageConversation(conversation, membership)) throw ChatErrors.managementForbidden();

    const updated = await this.deps.conversations.update(
      conversation.organizationId,
      conversation.id,
      {
        ...(changes.name !== undefined && {
          name: changes.name,
          ...(conversation.type === 'CHANNEL' && { slug: channelSlug(changes.name) }),
        }),
        ...(changes.description !== undefined && { description: changes.description }),
        ...(changes.archived !== undefined && { archivedAt: changes.archived ? this.now() : null }),
      },
    );
    if (!updated) throw ChatErrors.conversationNotFound();
    return updated;
  }

  /** Owners/admins add people; any organization member may join a channel on their own. */
  async addMembers(actor: ChatActor, id: string, userIds: string[]): Promise<void> {
    const { conversation, membership } = await this.access(actor, id);
    if (conversation.type === 'DIRECT') throw ChatErrors.directConversationFixed();

    const ids = [...new Set(userIds)];
    const joiningChannel =
      conversation.type === 'CHANNEL' && ids.length === 1 && ids[0] === actor.userId;
    if (!joiningChannel && !canManageConversation(conversation, membership)) {
      throw ChatErrors.managementForbidden();
    }
    await this.requireActiveMembers(actor, ids);

    const current = new Set(await this.deps.conversations.listMemberIds(conversation.id));
    const added = ids.filter((userId) => !current.has(userId));
    if (added.length === 0) return;

    await this.deps.conversations.addMembers(
      conversation.organizationId,
      conversation.id,
      added,
      'MEMBER',
    );
    await this.deps.realtime.membersChanged(conversation, [...current, ...added], { added });
  }

  /** Leaving is always allowed; removing others needs owner/admin, and only owners remove owners. */
  async removeMember(actor: ChatActor, id: string, userId: string): Promise<void> {
    const { conversation, membership } = await this.access(actor, id);
    if (conversation.type === 'DIRECT') throw ChatErrors.directConversationFixed();

    if (userId !== actor.userId) {
      if (!canManageConversation(conversation, membership)) throw ChatErrors.managementForbidden();
      const target = await this.deps.conversations.findMembership(conversation.id, userId);
      if (target?.role === 'OWNER' && membership?.role !== 'OWNER') {
        throw ChatErrors.managementForbidden();
      }
    }

    const recipients = await this.deps.conversations.listMemberIds(conversation.id);
    if (!(await this.deps.conversations.removeMember(conversation.id, userId))) {
      throw ChatErrors.memberNotFound();
    }
    await this.deps.conversations.ensureOwner(conversation.id);
    await this.deps.realtime.membersChanged(conversation, recipients, { removed: [userId] });
  }

  /** Read positions only move forward (risk register 9.6) and never past the last message. */
  async markRead(actor: ChatActor, id: string, seq: number): Promise<number> {
    const { conversation, membership } = await this.requireMember(actor, id);
    const previous = membership.lastReadSeq;
    const lastReadSeq = await this.deps.conversations.markRead(
      conversation.id,
      actor.userId,
      Math.min(seq, conversation.lastMessageSeq),
    );
    await this.deps.realtime.readUpdated(
      conversation,
      await this.deps.conversations.listMemberIds(conversation.id),
      { userId: actor.userId, lastReadSeq },
    );
    // Only when it actually moved: re-reading the same messages is not news to anyone.
    if (lastReadSeq > previous) {
      await this.deps.events.publish(
        createEvent(CONVERSATION_READ, {
          organization_id: conversation.organizationId,
          actor_id: actor.userId,
          subject_id: conversation.id,
          metadata: { conversation_id: conversation.id, last_read_seq: lastReadSeq },
        }),
      );
    }
    return lastReadSeq;
  }

  /**
   * Channels are public inside the organization. Direct and group conversations don't exist for
   * non-members - not even for organization admins (risk register 5.4).
   */
  async access(actor: ChatActor, id: string): Promise<ConversationAccess> {
    const conversation = await this.deps.conversations.findById(
      actor.organization.organizationId,
      id,
    );
    if (!conversation) throw ChatErrors.conversationNotFound();
    const membership = await this.deps.conversations.findMembership(conversation.id, actor.userId);
    if (!membership && conversation.type !== 'CHANNEL') throw ChatErrors.conversationNotFound();
    return { conversation, membership };
  }

  /** Reading and writing messages always requires membership. */
  async requireMember(actor: ChatActor, id: string): Promise<MemberAccess> {
    const { conversation, membership } = await this.access(actor, id);
    if (!membership) throw ChatErrors.joinRequired();
    return { conversation, membership };
  }

  private async requireActiveMembers(actor: ChatActor, userIds: readonly string[]): Promise<void> {
    if (userIds.length === 0) return;
    const active = await this.deps.directory.findActiveMemberIds(
      actor.organization.organizationId,
      userIds,
    );
    if (userIds.some((userId) => !active.has(userId))) throw ChatErrors.participantNotFound();
  }

  private async create(
    actor: ChatActor,
    input: Omit<NewConversation, 'organizationId' | 'createdById'>,
  ): Promise<Conversation | null> {
    const conversation = await this.deps.conversations.create({
      ...input,
      organizationId: actor.organization.organizationId,
      createdById: actor.userId,
    });
    if (!conversation) return null;

    const memberIds = input.members.map((member) => member.userId);
    const event: ConversationCreatedEvent = createEvent(CONVERSATION_CREATED, {
      organization_id: conversation.organizationId,
      actor_id: actor.userId,
      subject_id: conversation.id,
      metadata: { type: conversation.type, member_ids: memberIds },
    });
    await this.deps.events.publish(event);
    await this.deps.realtime.membersChanged(conversation, memberIds, { added: memberIds });
    return conversation;
  }
}

function channelSlug(name: string): string {
  const slug = slugify(name, 80);
  if (!slug) throw ChatErrors.invalidChannelName();
  return slug;
}
