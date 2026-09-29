import { randomInt, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../lib/errors.js';
import { getCodeStore } from '../lib/codeStore.js';
import { env } from '../config/env.js';
import { isEmailConfigured, sendOtpEmail } from './emailService.js';

export type OtpPurpose = 'verify' | 'reset' | 'signup';

interface OtpRecord {
  code: string;
  expiresAt: number;
}

const normalize = (email: string) => email.trim().toLowerCase();

export const otpKey = (purpose: OtpPurpose, email: string) =>
  `otp:${purpose}:${normalize(email)}`;

const attemptsKey = (purpose: OtpPurpose, email: string) =>
  `otp:attempts:${purpose}:${normalize(email)}`;

const throttleKey = (purpose: OtpPurpose, email: string) =>
  `otp:sent:${purpose}:${normalize(email)}`;

const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

function record(raw: string | null): OtpRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as OtpRecord;
    return typeof parsed.code === 'string' && typeof parsed.expiresAt === 'number'
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function matches(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Generates a 6-digit code, stores it under `purpose:email` and emails it.
 * Throws when the per-email send budget is exhausted (429) or SMTP fails —
 * a failed send removes the code so a half-issued OTP never lingers.
 */
export async function issueOtp(purpose: OtpPurpose, email: string, name = 'there'): Promise<string> {
  const store = getCodeStore();
  const sends = await store.incr(
    throttleKey(purpose, email),
    env.otp.sendWindowSeconds
  );
  if (sends > env.otp.maxSendsPerWindow) {
    throw ApiError.tooManyRequests(
      `Too many codes requested for this address. Try again in ${Math.round(
        env.otp.sendWindowSeconds / 60
      )} minutes.`
    );
  }

  const expiresAt = Date.now() + env.otp.ttlSeconds * 1000;
  const otp: OtpRecord = { code: newCode(), expiresAt };
  await store.set(otpKey(purpose, email), JSON.stringify(otp), env.otp.ttlSeconds);
  await store.del(attemptsKey(purpose, email));

  if (!isEmailConfigured()) {
    if (env.isDev || env.isTest) {
      console.log(`[AUTH OTP DEV] Purpose: ${purpose} | Email: ${email} | Code: ${otp.code}`);
      return otp.code;
    }
    throw ApiError.serviceUnavailable(
      'Email is not configured on this server. Set BREVO_API_KEY or SMTP_HOST in backend/.env.'
    );
  }

  try {
    await sendOtpEmail({ to: normalize(email), name, code: otp.code, purpose });
  } catch (err) {
    await store.del(otpKey(purpose, email));
    throw err;
  }

  return otp.code;
}

export type OtpCheck =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'expired' | 'attempts' };

/**
 * Checks a submitted code. Wrong guesses burn attempts; once the budget is
 * gone the code is destroyed. A correct code is consumed immediately.
 */
export async function verifyOtp(purpose: OtpPurpose, email: string, code: string): Promise<OtpCheck> {
  const store = getCodeStore();
  const raw = await store.get(otpKey(purpose, email));
  const saved = record(raw);
  if (!saved) return { ok: false, reason: 'invalid' };

  if (saved.expiresAt <= Date.now()) {
    await store.del(otpKey(purpose, email));
    return { ok: false, reason: 'expired' };
  }

  if (matches(code.trim(), saved.code)) {
    await store.del(otpKey(purpose, email));
    await store.del(attemptsKey(purpose, email));
    return { ok: true };
  }

  const remaining = Math.max(1, Math.ceil((saved.expiresAt - Date.now()) / 1000));
  const attempts = await store.incr(attemptsKey(purpose, email), remaining);
  if (attempts >= env.otp.maxAttempts) {
    await store.del(otpKey(purpose, email));
    await store.del(attemptsKey(purpose, email));
    return { ok: false, reason: 'attempts' };
  }
  return { ok: false, reason: 'invalid' };
}
