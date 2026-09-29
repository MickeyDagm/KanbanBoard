import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Applies pending migrations to the TEST database before any test file runs.
 * DATABASE_URL is forced to DATABASE_URL_TEST so we can never touch dev data.
 */
export default function globalSetup() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }

  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) {
    throw new Error('DATABASE_URL_TEST is not set — fill in backend/.env (see backend/.env.example).');
  }

  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testUrl, NODE_ENV: 'test' },
  });
}
