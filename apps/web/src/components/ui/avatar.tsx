'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<Size, string> = {
  xs: 'size-5 text-[9px]',
  sm: 'size-7 text-[11px]',
  md: 'size-9 text-xs',
  lg: 'size-11 text-sm',
  xl: 'size-20 text-2xl',
};

const DOT: Record<Size, string> = {
  xs: 'size-1.5',
  sm: 'size-2',
  md: 'size-2.5',
  lg: 'size-3',
  xl: 'size-4',
};

/** "Nguyễn Thị Lan" -> "NL": the first and last words, which is how Vietnamese names read. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '?';
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

/**
 * Photo or initials. Initials use the accent tint only - colors carry no meaning here, so
 * there is no rainbow of avatar colors (spec §19).
 */
export function Avatar({
  name,
  src,
  size = 'md',
  presence,
  className,
}: {
  name: string;
  src?: string | null;
  size?: Size;
  presence?: 'online' | 'offline' | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={cn('relative inline-flex shrink-0 rounded-full', className)}>
      {src && !failed ? (
        // Avatars come from arbitrary hosts, so a plain img (decorative: the name is shown nearby).
        <img
          src={src}
          alt=""
          onError={() => setFailed(true)}
          className={cn('rounded-full object-cover', SIZES[size])}
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            'inline-flex items-center justify-center rounded-full bg-accent-soft font-semibold text-accent',
            SIZES[size],
          )}
        >
          {initialsOf(name)}
        </span>
      )}
      {presence && (
        <span
          className={cn(
            'absolute right-0 bottom-0 rounded-full ring-2 ring-surface',
            DOT[size],
            presence === 'online' ? 'bg-success' : 'bg-border',
          )}
        />
      )}
    </span>
  );
}
