import { useId } from 'react';
import { cn } from '@/lib/cn';

/** The NEXA "N" mark: a stem, a diagonal band and a short second stem (brand sheet). */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  const id = useId();
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn('size-7 shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={`${id}-band`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#087F6C" />
          <stop offset="1" stopColor="#35B695" />
        </linearGradient>
      </defs>
      <rect x="6" y="8" width="16" height="48" rx="5" fill="#087F6C" />
      <line
        x1="14"
        y1="16"
        x2="50"
        y2="48"
        stroke={`url(#${id}-band)`}
        strokeWidth="16"
        strokeLinecap="round"
      />
      <rect x="42" y="8" width="16" height="20" rx="4.5" fill="#0C957E" />
    </svg>
  );
}

/** Horizontal logo: mark + wordmark (the primary lockup). */
export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-fg', className)}>
      <LogoMark className={markClassName} />
      <span className="text-[15px] font-bold tracking-[0.12em]">NEXA</span>
    </span>
  );
}
