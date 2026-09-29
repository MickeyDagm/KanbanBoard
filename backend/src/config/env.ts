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

const cookieSameSite = process.env.COOKIE_SAMESITE ?? 'lax';
if (cookieSameSite !== 'lax' && cookieSameSite !== 'none') {
  throw new Error(
    `Invalid COOKIE_SAMESITE: "${cookieSameSite}". Use "lax" (same-site deploys, ` +
      `the default) or "none" (frontend and API on different sites, e.g. two ` +
      `separate *.onrender.com services — requires HTTPS, which Render provides).`
  );
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  isDev: (process.env.NODE_ENV ?? 'development') === 'development',
  isTest: process.env.NODE_ENV === 'test',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  clientOrigin,
  cookieName: 'kanban_token',
  /**
   * SameSite policy for the auth cookie. `lax` (default) works when the SPA
   * and API share a registrable domain (localhost, or app.example.com +
   * api.example.com). Use `none` when they are cross-site — e.g. two separate
   * *.onrender.com services, since onrender.com is on the Public Suffix List.
   * `none` always requires Secure, so it needs HTTPS (isProd below).
   */
  cookieSameSite: cookieSameSite as 'lax' | 'none',

  /** Public base URL used to build links that leave the app (invite emails). */
  publicUrl: (process.env.PUBLIC_URL ?? clientOrigin).replace(/\/+$/, ''),
  appName: process.env.APP_NAME ?? 'Kanban',

  /** Brevo API configuration */
  brevo: {
    apiKey: process.env.BREVO_API_KEY ?? '',
    fromEmail: process.env.BREVO_FROM_EMAIL ?? '',
  },

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
