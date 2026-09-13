'use client';

import { Suspense } from 'react';
import { ChannelBrowser } from '@/features/channels/channel-browser';

export default function ChannelsPage() {
  return (
    <Suspense>
      <ChannelBrowser />
    </Suspense>
  );
}
