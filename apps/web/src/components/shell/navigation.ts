import {
  Hash,
  Home,
  LayoutList,
  MessageSquare,
  Settings,
  Shield,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { MessageKey } from '@/i18n/translate';

export interface NavItem {
  href: string;
  label: MessageKey;
  icon: LucideIcon;
}

export interface NavSection {
  label: MessageKey;
  items: NavItem[];
}

/** Information architecture (spec §2): few top-level destinations, grouped by intent. */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'nav.home',
    items: [
      { href: '/home', label: 'nav.overview', icon: Home },
      { href: '/feed', label: 'nav.feed', icon: LayoutList },
    ],
  },
  {
    label: 'nav.communicate',
    items: [
      { href: '/messages', label: 'nav.messages', icon: MessageSquare },
      { href: '/channels', label: 'nav.channels', icon: Hash },
    ],
  },
  {
    label: 'nav.people',
    items: [{ href: '/people', label: 'nav.directory', icon: Users }],
  },
];

export const SETTINGS_ITEM: NavItem = { href: '/settings', label: 'nav.settings', icon: Settings };
export const ADMIN_ITEM: NavItem = { href: '/admin', label: 'nav.admin', icon: Shield };

/** Mobile bottom navigation: only the highest-frequency destinations (spec §13). */
export const MOBILE_ITEMS: NavItem[] = [
  { href: '/home', label: 'nav.home', icon: Home },
  { href: '/messages', label: 'nav.messages', icon: MessageSquare },
  { href: '/channels', label: 'nav.channels', icon: Hash },
  { href: '/people', label: 'nav.people', icon: Users },
];

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
