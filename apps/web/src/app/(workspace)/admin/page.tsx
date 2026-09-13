'use client';

import { Suspense } from 'react';
import { AdminPage } from '@/features/admin/admin-page';

export default function AdminRoute() {
  return (
    <Suspense>
      <AdminPage />
    </Suspense>
  );
}
