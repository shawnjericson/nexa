import { Check, ChevronRight } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;
export const MenuGroup = DropdownMenu.Group;
export const MenuSub = DropdownMenu.Sub;
export const MenuRadioGroup = DropdownMenu.RadioGroup;

const PANEL =
  'z-50 min-w-48 overflow-hidden rounded-lg border border-border bg-surface p-1 text-sm text-fg shadow-lg ' +
  'data-[state=open]:animate-in data-[state=closed]:animate-out';

const ITEM =
  'relative flex h-8 cursor-default select-none items-center gap-2 rounded-md px-2 text-[13px] outline-none ' +
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-subtle ' +
  '[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted';

export function MenuContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content sideOffset={sideOffset} className={cn(PANEL, className)} {...props} />
    </DropdownMenu.Portal>
  );
}

export function MenuItem({
  className,
  destructive,
  ...props
}: ComponentProps<typeof DropdownMenu.Item> & { destructive?: boolean }) {
  return (
    <DropdownMenu.Item
      className={cn(ITEM, destructive && 'text-danger [&_svg]:text-danger', className)}
      {...props}
    />
  );
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenu.Label>) {
  return (
    <DropdownMenu.Label className={cn('px-2 py-1.5 text-xs text-muted', className)} {...props} />
  );
}

export function MenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenu.Separator>) {
  return (
    <DropdownMenu.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
  );
}

export function MenuSubTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenu.SubTrigger>) {
  return (
    <DropdownMenu.SubTrigger
      className={cn(ITEM, 'data-[state=open]:bg-surface-subtle', className)}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto" aria-hidden />
    </DropdownMenu.SubTrigger>
  );
}

export function MenuSubContent({
  className,
  ...props
}: ComponentProps<typeof DropdownMenu.SubContent>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.SubContent sideOffset={4} className={cn(PANEL, className)} {...props} />
    </DropdownMenu.Portal>
  );
}

export function MenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenu.RadioItem>) {
  return (
    <DropdownMenu.RadioItem className={cn(ITEM, 'pr-8', className)} {...props}>
      {children}
      <DropdownMenu.ItemIndicator className="absolute right-2 inline-flex">
        <Check aria-hidden />
      </DropdownMenu.ItemIndicator>
    </DropdownMenu.RadioItem>
  );
}
