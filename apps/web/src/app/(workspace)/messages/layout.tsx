'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { ConversationList } from '@/features/chat/conversation-list';
import { cn } from '@/lib/cn';

/**
 * From lg up the sidebar already lists the conversations, so this pane only appears below it:
 * on a tablet next to the conversation, and on a phone as one pane at a time (spec §13).
 */
export default function MessagesLayout({ children }: { children: ReactNode }) {
  const inConversation = usePathname() !== '/messages';
  return (
    <div className="flex h-full min-h-0">
      <div
        className={cn(
          'h-full w-full shrink-0 border-r border-border bg-surface md:w-80 lg:hidden',
          inConversation && 'hidden md:block',
        )}
      >
        <ConversationList />
      </div>
      <div className={cn('h-full min-w-0 flex-1', inConversation ? 'flex' : 'hidden md:flex')}>
        {children}
      </div>
    </div>
  );
}
