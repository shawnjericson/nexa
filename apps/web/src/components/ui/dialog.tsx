'use client';

import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { useI18n } from '@/i18n/provider';
import { cn } from '@/lib/cn';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/**
 * Centered on desktop, a full-width sheet from the bottom on small screens (spec §13: details as
 * full-screen views on mobile).
 */
export function DialogContent({
  title,
  description,
  children,
  className,
  hideTitle = false,
  ...props
}: Omit<ComponentProps<typeof DialogPrimitive.Content>, 'title'> & {
  // Rendered as the dialog's heading, not as the HTML title attribute.
  title: ReactNode;
  description?: ReactNode;
  hideTitle?: boolean;
}) {
  const { t } = useI18n();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="animate-overlay fixed inset-0 z-40 bg-overlay" />
      <DialogPrimitive.Content
        className={cn(
          'animate-dialog fixed z-50 flex max-h-[90dvh] flex-col overflow-hidden border border-border bg-surface shadow-xl',
          'inset-x-0 bottom-0 rounded-t-xl sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-lg',
          'sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl',
          className,
        )}
        {...props}
      >
        <div className={cn('flex items-start gap-3 px-5 pt-4', hideTitle && 'sr-only')}>
          <div className="min-w-0 flex-1">
            <DialogPrimitive.Title className="text-base font-semibold">
              {title}
            </DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="mt-1 text-sm text-muted">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            className="-mr-1 inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-subtle hover:text-fg"
            aria-label={t('common.close')}
          >
            <X className="size-4" aria-hidden />
          </DialogPrimitive.Close>
        </div>
        {!description && (
          <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-5">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mt-5 flex justify-end gap-2', className)} {...props} />;
}
