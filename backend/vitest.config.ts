import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Load backend/.env so DATABASE_URL_TEST is available (test env vars are then
// injected into workers via `test.env`, and env.ts skips file loading in tests).
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
if (!testDatabaseUrl) {
  throw new Error('DATABASE_URL_TEST is not set — copy backend/.env.example to backend/.env and fill it in.');
}

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    environment: 'node',
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      JWT_SECRET: process.env.JWT_SECRET ?? 'test-secret',
    },
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
