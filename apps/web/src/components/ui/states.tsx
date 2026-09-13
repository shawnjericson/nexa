'use client';

import { AlertCircle, type LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { useI18n } from '@/i18n/provider';
import { describeError } from '@/lib/api/errors';
import { cn } from '@/lib/cn';
import { Button } from './button';

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-md bg-surface-subtle', className)}
      {...props}
    />
  );
}

/** What is empty, and the next useful action (spec §15). */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mx-auto flex max-w-sm flex-col items-center gap-2 px-6 py-12 text-center',
        className,
      )}
    >
      {Icon && <Icon className="mb-1 size-6 text-muted" aria-hidden />}
      <p className="text-sm font-semibold text-fg">{title}</p>
      {description && <p className="text-sm text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** What failed, and a retry when retrying can help. Never reveals resource details. */
export function ErrorState({
  error,
  title,
  onRetry,
  className,
}: {
  error?: unknown;
  title?: ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  const i18n = useI18n();
  return (
    <EmptyState
      className={className}
      icon={AlertCircle}
      title={title ?? i18n.t('errors.loadFailed')}
      description={error === undefined ? undefined : describeError(error, i18n)}
      action={
        onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {i18n.t('common.retry')}
          </Button>
        )
      }
    />
  );
}

/** Page header: title plus optional actions, consistent across screens. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="text-title font-semibold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
