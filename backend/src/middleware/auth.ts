import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { verifyToken } from '../utils/tokens.js';

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[env.cookieName];
    if (!token) throw ApiError.unauthorized();

    const { sub: userId } = verifyToken(token);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, avatarColor: true, createdAt: true },
    });
    if (!user) throw ApiError.unauthorized('Session is no longer valid');

    req.user = user;
    next();
  } catch (err) {
    next(err instanceof ApiError ? err : ApiError.unauthorized('Invalid or expired session'));
  }
}
