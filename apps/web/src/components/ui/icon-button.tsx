import type { LucideIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Button, type ButtonProps } from './button';
import { Tooltip } from './tooltip';

/** Icon-only button: always labelled for screen readers and shown as a tooltip (spec §14). */
export function IconButton({
  label,
  icon: Icon,
  size = 'icon',
  tooltip = true,
  children,
  ...props
}: Omit<ButtonProps, 'asChild'> & {
  label: string;
  icon: LucideIcon;
  tooltip?: boolean;
  size?: 'icon' | 'icon-sm';
} & Pick<ComponentProps<'button'>, 'onClick'>) {
  const button = (
    <Button variant="ghost" size={size} aria-label={label} {...props}>
      <Icon aria-hidden />
      {children}
    </Button>
  );
  return tooltip ? <Tooltip content={label}>{button}</Tooltip> : button;
}
