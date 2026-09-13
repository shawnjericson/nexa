import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'accent' | 'danger' | 'warning';

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-subtle text-muted',
  accent: 'bg-accent-soft text-accent',
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
};

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: ComponentProps<'span'> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-md px-1.5 text-[11px] font-medium whitespace-nowrap',
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

/** Keyboard shortcut hint. */
export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 items-center rounded border border-border bg-surface-subtle px-1 font-sans text-[11px] text-muted',
        className,
      )}
      {...props}
    />
  );
}
