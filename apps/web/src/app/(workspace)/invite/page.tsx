'use client';

import { Suspense } from 'react';
import { AcceptInvitation } from '@/features/admin/accept-invitation';

export default function InviteRoute() {
  return (
    <Suspense>
      <AcceptInvitation />
    </Suspense>
  );
}
