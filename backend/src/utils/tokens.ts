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

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(env.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    path: '/',
    maxAge: SEVEN_DAYS_MS,
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(env.cookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    path: '/',
  });
}
