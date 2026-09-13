'use client';

import { Loader2, MessagesSquare } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/ui/states';
import { useOpenDirect } from '@/features/chat/queries';
import { useI18n } from '@/i18n/provider';
import { describeError } from '@/lib/api/errors';

/** No conversation open. `?to=<userId>` opens (or starts) the direct conversation with them. */
export default function MessagesPage() {
  const i18n = useI18n();
  const router = useRouter();
  const to = useSearchParams().get('to');
  const openDirect = useOpenDirect();
  const started = useRef<string | null>(null);

  useEffect(() => {
    if (!to || started.current === to) return;
    started.current = to;
    openDirect.mutate(to, {
      onSuccess: (conversation) => router.replace(`/messages/${conversation.id}`),
      onError: (error) => toast.error(describeError(error, i18n)),
    });
  }, [to, openDirect, router, i18n]);

  if (to && !openDirect.isError) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted" aria-label={i18n.t('common.loading')} />
      </div>
    );
  }
  return (
    <EmptyState
      className="flex-1 justify-center"
      icon={MessagesSquare}
      title={i18n.t('chat.selectTitle')}
      description={i18n.t('chat.selectDescription')}
    />
  );
}
