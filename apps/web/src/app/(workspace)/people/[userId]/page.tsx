'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Profile } from '@/features/people/profile';
import { useI18n } from '@/i18n/provider';

export default function ProfilePage() {
  const { t } = useI18n();
  const { userId } = useParams<{ userId: string }>();
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-4">
        <Link href="/people">
          <ArrowLeft aria-hidden />
          {t('people.title')}
        </Link>
      </Button>
      <Profile userId={userId} />
    </div>
  );
}
