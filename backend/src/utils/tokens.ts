import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import { env } from '../config/env.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): { sub: string } {
  const payload = jwt.verify(token, env.jwtSecret);
  if (typeof payload === 'string' || !payload.sub) {
    throw new Error('Invalid token payload');
  }
  return { sub: payload.sub };
}

export function signSignupToken(email: string): string {
  return jwt.sign(
    { email: email.trim().toLowerCase(), purpose: 'signup_verified' },
    env.jwtSecret,
    { expiresIn: '30m' }
  );
}

export function verifySignupToken(token: string): { email: string } {
  const payload = jwt.verify(token, env.jwtSecret);
  if (
    typeof payload === 'string' ||
    !payload.email ||
    payload.purpose !== 'signup_verified'
  ) {
    throw new Error('Invalid or expired signup verification token');
  }
  return { email: payload.email as string };
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(env.cookieName, token, {
    httpOnly: true,
    sameSite: env.cookieSameSite,
    secure: env.isProd,
    path: '/',
    maxAge: SEVEN_DAYS_MS,
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(env.cookieName, {
    httpOnly: true,
    sameSite: env.cookieSameSite,
    secure: env.isProd,
    path: '/',
  });
}
