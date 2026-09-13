'use client';

import { Skeleton } from '@/components/ui/states';
import { useMe } from '@/features/session/use-me';
import { useI18n } from '@/i18n/provider';

function greetingKey(hour: number) {
  if (hour < 12) return 'home.greetingMorning' as const;
  if (hour < 18) return 'home.greetingAfternoon' as const;
  return 'home.greetingEvening' as const;
}

/** A concise workplace briefing, not a dashboard of metric cards (spec §6). */
export default function HomePage() {
  const { t, formatDate } = useI18n();
  const { data: me } = useMe();
  const now = new Date();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8">
      {me ? (
        <h1 className="text-title font-semibold tracking-tight">
          {/* The whole display name: whether it's written given-name first can't be guessed. */}
          {t(greetingKey(now.getHours()), { name: me.display_name })}
        </h1>
      ) : (
        <Skeleton className="h-8 w-64" />
      )}
      <p className="mt-1 text-sm text-muted">
        {formatDate(now, { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>
    </div>
  );
}
