'use client';

import { useParams } from 'next/navigation';
import { ConversationView } from '@/features/chat/conversation-view';

export default function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  return <ConversationView key={conversationId} conversationId={conversationId} />;
}
