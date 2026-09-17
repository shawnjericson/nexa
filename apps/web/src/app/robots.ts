import type { MetadataRoute } from 'next';

const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL?.trim().replace(/\/+$/, '');

/** Workspace pages send crawlers to sign in anyway; link previews need the pictures. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
    ...(PUBLIC_APP_URL && { sitemap: `${PUBLIC_APP_URL}/sitemap.xml` }),
  };
}
