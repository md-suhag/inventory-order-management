import { defineConfig } from 'vitest/config';

/** Integration tests run against a real PostgreSQL database (TECHNICAL_DECISIONS TD-21). */
const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? 'postgresql://inventory:inventory@localhost:5433/inventory_test?schema=public';

const testEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DATABASE_URL,
  JWT_ACCESS_SECRET: 'test-only-secret-that-is-long-enough-1234567890',
  BCRYPT_ROUNDS: '4',
  RATE_LIMIT_ENABLED: 'false',
  LOG_LEVEL: 'silent',
  UPLOAD_DIR: 'uploads-test',
  APP_URL: 'http://localhost:3000',
  CORS_ORIGINS: 'http://localhost:3000',
};

export default defineConfig({
  test: {
    env: testEnv,
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['tests/unit/**/*.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          globalSetup: ['tests/helpers/global-setup.ts'],
          // Files share one database: run them one at a time.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/database/seed/run.ts'],
    },
  },
});
