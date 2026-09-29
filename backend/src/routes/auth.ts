import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { clearAuthCookie, setAuthCookie, signToken } from '../utils/tokens.js';
import { pickAvatarColor } from '../utils/selects.js';
import { env } from '../config/env.js';
import { isEmailConfigured } from '../services/emailService.js';
import { issueOtp, verifyOtp, type OtpCheck } from '../services/otpService.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  // The test suite performs many auth calls from a single IP.
  skip: () => env.isTest,
});

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
  name: z.string().trim().min(1).max(60),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const emailSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

const codeSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

const resetSchema = codeSchema.extend({
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
});

const publicUser = {
  id: true,
  email: true,
  name: true,
  avatarColor: true,
  createdAt: true,
} as const;

/** OTP verification only kicks in once outbound email actually works. */
const otpRequired = () => isEmailConfigured();

function otpError(check: Extract<OtpCheck, { ok: false }>): ApiError {
  switch (check.reason) {
    case 'expired':
      return ApiError.badRequest('That code has expired — request a new one');
    case 'attempts':
      return ApiError.badRequest('Too many wrong attempts — request a new code');
    default:
      return ApiError.badRequest('Invalid code');
  }
}

/**
 * Removes a freshly registered, still-unverified account (used when the
 * verification email could not be sent, so nobody is left half-registered).
 */
async function discardUser(userId: string) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.team.deleteMany({ where: { createdById: userId } });
      await tx.user.delete({ where: { id: userId } });
    });
  } catch (err) {
    console.error('Could not roll back registration:', err);
  }
}

router.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, password, name } = req.body as z.infer<typeof registerSchema>;
    const needsOtp = otpRequired();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw ApiError.conflict('An account with this email already exists');

    const passwordHash = await bcrypt.hash(password, 10);

    let user: { id: string; email: string; name: string; avatarColor: string; createdAt: Date };
    try {
      user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email,
            passwordHash,
            name,
            avatarColor: pickAvatarColor(email),
            emailVerifiedAt: needsOtp ? null : new Date(),
          },
          select: publicUser,
        });
        await tx.team.create({
          data: {
            name: 'Personal',
            createdById: created.id,
            members: { create: { userId: created.id, role: 'OWNER' } },
          },
        });
        return created;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw ApiError.conflict('An account with this email already exists');
      }
      throw err;
    }

    if (needsOtp) {
      try {
        await issueOtp('verify', email, name);
      } catch (err) {
        await discardUser(user.id);
        throw err instanceof ApiError
          ? err
          : ApiError.badGateway(
              'Could not send the verification email. Check the SMTP settings in backend/.env.'
            );
      }
      res.status(201).json({ user, requiresVerification: true });
      return;
    }

    setAuthCookie(res, signToken(user.id));
    res.status(201).json({ user });
  })
);

// POST /auth/verify-email — confirms the address and signs the user in
router.post(
  '/verify-email',
  authLimiter,
  validate(codeSchema),
  asyncHandler(async (req, res) => {
    const { email, code } = req.body as z.infer<typeof codeSchema>;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw otpError({ ok: false, reason: 'invalid' });
    if (user.emailVerifiedAt) {
      throw ApiError.badRequest('This email is already verified — sign in instead');
    }

    const check = await verifyOtp('verify', email, code);
    if (!check.ok) throw otpError(check);
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });

    setAuthCookie(res, signToken(user.id));
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarColor: user.avatarColor,
        createdAt: user.createdAt,
      },
    });
  })
);

// POST /auth/resend-verification — no-op for unknown/verified addresses
router.post(
  '/resend-verification',
  authLimiter,
  validate(emailSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body as z.infer<typeof emailSchema>;
    if (!otpRequired()) {
      res.status(202).json({ ok: true });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (user && !user.emailVerifiedAt) {
      await issueOtp('verify', email, user.name);
    }

    res.status(202).json({ ok: true });
  })
);

// POST /auth/forgot-password — emails a reset code (always 202 when it works)
router.post(
  '/forgot-password',
  authLimiter,
  validate(emailSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body as z.infer<typeof emailSchema>;
    if (!otpRequired()) {
      throw ApiError.serviceUnavailable(
        'Email is not configured on this server. Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS in backend/.env, then restart it.'
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (user) await issueOtp('reset', email, user.name);

    res.status(202).json({ ok: true });
  })
);

// POST /auth/reset-password — proves ownership of the address, sets a new password
router.post(
  '/reset-password',
  authLimiter,
  validate(resetSchema),
  asyncHandler(async (req, res) => {
    const { email, code, password } = req.body as z.infer<typeof resetSchema>;

    const check = await verifyOtp('reset', email, code);
    if (!check.ok) throw otpError(check);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw otpError({ ok: false, reason: 'invalid' });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(password, 10),
        // Owning the inbox is exactly what the code proves.
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      },
    });

    res.json({ ok: true });
  })
);

router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;

    const user = await prisma.user.findUnique({ where: { email } });
    const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !valid) throw ApiError.unauthorized('Invalid email or password');

    if (!user.emailVerifiedAt) {
      // Password is correct, so handing over a fresh code only helps the owner.
      await issueOtp('verify', email, user.name).catch(() => undefined);
      throw new ApiError(
        403,
        'EMAIL_NOT_VERIFIED',
        'Verify your email to sign in — we just sent you a new code.'
      );
    }

    setAuthCookie(res, signToken(user.id));
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarColor: user.avatarColor,
        createdAt: user.createdAt,
      },
    });
  })
);

router.post(
  '/logout',
  asyncHandler(async (_req, res) => {
    clearAuthCookie(res);
    res.json({ ok: true });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  })
);

export default router;
