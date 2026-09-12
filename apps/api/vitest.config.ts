import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      RATE_LIMIT_ENABLED: 'false',
      DATABASE_URL: 'postgresql://nexa:test@127.0.0.1:5432/nexa_test',
    },
  },
});
