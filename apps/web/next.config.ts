import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The typed API client is TypeScript source in the monorepo.
  transpilePackages: ['@nexa/api-client'],
};

export default config;
