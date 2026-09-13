import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { getLocale } from '@/i18n/server';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'NEXA', template: '%s · NEXA' },
  description: 'NEXA Workplace - Work. Connect. Grow.',
  applicationName: 'NEXA',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Keeps the composer above the mobile keyboard (spec §13).
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f7f5' },
    { media: '(prefers-color-scheme: dark)', color: '#151614' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <body className="font-sans">
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
