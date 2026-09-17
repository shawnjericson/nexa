import type { MetadataRoute } from 'next';

const PUBLIC_APP_URL =
  process.env.PUBLIC_APP_URL?.trim().replace(/\/+$/, '') || 'http://localhost:3000';

/** The pages anyone can open without an account. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${PUBLIC_APP_URL}/`, changeFrequency: 'monthly', priority: 1 },
    { url: `${PUBLIC_APP_URL}/register`, changeFrequency: 'yearly', priority: 0.5 },
  ];
}
