import { Hash, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/cn';
import type { ConversationType } from '@/lib/chat-types';
import type { UserRef } from '@/lib/types';

interface Describable {
  type: ConversationType;
  name: string | null;
  direct_peer?: UserRef | null;
}

/** Direct conversations are named after the other person; groups and channels by their name. */
export function conversationTitle(conversation: Describable, formerMember: string): string {
  if (conversation.type === 'DIRECT') return conversation.direct_peer?.display_name ?? formerMember;
  return conversation.name ?? '';
}

export function ConversationIcon({
  conversation,
  title,
  size = 'md',
  online,
}: {
  conversation: Describable;
  title: string;
  size?: 'sm' | 'md';
  online?: boolean;
}) {
  if (conversation.type === 'DIRECT') {
    return (
      <Avatar
        name={title}
        src={conversation.direct_peer?.avatar_url}
        size={size}
        presence={online === undefined ? null : online ? 'online' : 'offline'}
      />
    );
  }
  const Icon = conversation.type === 'CHANNEL' ? Hash : Users;
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg bg-surface-subtle text-muted',
        size === 'sm' ? 'size-7' : 'size-9',
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}
