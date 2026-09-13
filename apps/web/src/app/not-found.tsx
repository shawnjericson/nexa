'use client';

import { FileQuestion } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { useI18n } from '@/i18n/provider';

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <EmptyState
        icon={FileQuestion}
        title={t('notFound.title')}
        description={t('notFound.description')}
        action={
          <Button asChild variant="secondary">
            <Link href="/home">{t('notFound.action')}</Link>
          </Button>
        }
      />
    </div>
  );
}
