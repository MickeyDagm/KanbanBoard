import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load backend/.env (skipped in tests — vitest injects env vars itself)
if (process.env.NODE_ENV !== 'test') {
  const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const envPath = path.join(backendRoot, '.env');
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

const missing: string[] = [];
if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
if (missing.length > 0) {
  throw new Error(
    `Missing environment variables: ${missing.join(', ')}. ` +
      `Copy backend/.env.example to backend/.env and fill in the values.`
  );
}

const databaseUrl = process.env.DATABASE_URL as string;
const jwtSecret = process.env.JWT_SECRET as string;

const smtpPort = Number(process.env.SMTP_PORT ?? 587);
const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  clientOrigin,
  cookieName: 'kanban_token',

  /** Public base URL used to build links that leave the app (invite emails). */
  publicUrl: (process.env.PUBLIC_URL ?? clientOrigin).replace(/\/+$/, ''),
  appName: process.env.APP_NAME ?? 'Kanban',

  /** SMTP — leave SMTP_HOST empty to disable outbound email entirely. */
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: smtpPort,
    secure:
      process.env.SMTP_SECURE !== undefined
        ? process.env.SMTP_SECURE === 'true'
        : smtpPort === 465,
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? '',
  },

  /**
   * Redis — used for short-lived codes (OTP) so several instances can share
   * state. Leave REDIS_URL empty to fall back to an in-process store (fine
   * for local dev / a single instance, NOT for horizontal scaling).
   */
  redisUrl: process.env.REDIS_URL ?? '',

  /** One-time codes (email verification + password reset). */
  otp: {
    ttlSeconds: Number(process.env.OTP_TTL_SECONDS ?? 600),
    maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS ?? 5),
    maxSendsPerWindow: Number(process.env.OTP_MAX_SENDS ?? 3),
    sendWindowSeconds: Number(process.env.OTP_SEND_WINDOW_SECONDS ?? 900),
  },
};
