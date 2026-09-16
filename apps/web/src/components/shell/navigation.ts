import {
  Hash,
  Home,
  LayoutList,
  MessageSquare,
  Search,
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

/**
 * Information architecture (spec §2): few top-level destinations. Conversations are not in this
 * list - the sidebar shows the channels and people themselves, the way they are thought of.
 */
export const PRIMARY_ITEMS: NavItem[] = [
  { href: '/home', label: 'nav.overview', icon: Home },
  { href: '/feed', label: 'nav.feed', icon: LayoutList },
  { href: '/people', label: 'nav.directory', icon: Users },
];

/** Everywhere the command palette can go. */
export const PAGE_ITEMS: NavItem[] = [
  ...PRIMARY_ITEMS,
  { href: '/messages', label: 'nav.messages', icon: MessageSquare },
  { href: '/channels', label: 'nav.channels', icon: Hash },
  { href: '/search', label: 'nav.search', icon: Search },
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
