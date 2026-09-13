import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

const FIELD =
  'w-full rounded-md border border-border bg-surface px-3 text-sm text-fg transition-colors ' +
  'placeholder:text-muted focus-visible:border-accent focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-accent/20 aria-invalid:border-danger ' +
  'aria-invalid:focus-visible:ring-danger/20 disabled:cursor-not-allowed disabled:opacity-50';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(FIELD, 'h-9', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(FIELD, 'min-h-20 resize-y py-2', className)} {...props} />;
}

/** A native select: the platform's own picker is the most accessible one on every device. */
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(FIELD, 'h-9', className)} {...props} />;
}

/** A labelled input with hint and error text wired up for assistive technology. */
export function TextField({
  label,
  hint,
  error,
  className,
  ...props
}: ComponentProps<'input'> & { label: ReactNode; hint?: ReactNode; error?: ReactNode }) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-fg">
        {label}
      </label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
