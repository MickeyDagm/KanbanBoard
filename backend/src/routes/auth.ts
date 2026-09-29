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
import {
  clearAuthCookie,
  setAuthCookie,
  signToken,
  signSignupToken,
  verifySignupToken,
} from '../utils/tokens.js';
import { pickAvatarColor } from '../utils/selects.js';
import { env } from '../config/env.js';
import { isEmailConfigured, sendOtpEmail } from '../services/emailService.js';
import { issueOtp, verifyOtp, type OtpCheck } from '../services/otpService.js';
import { inviteStatus } from './invites.js';
import { emitTeamEvent } from '../realtime/socket.js';
import { notifyInviteRedeemed } from '../services/notificationService.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.isTest,
});

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
  name: z.string().trim().min(1, 'Name is required').max(60),
  signupToken: z.string().optional(),
  inviteCode: z.string().trim().optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, 'Password is required'),
  inviteCode: z.string().trim().optional(),
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

// POST /auth/signup/send-otp — Step 1.2 & 1.3: asks email, sends OTP
router.post(
  '/signup/send-otp',
  authLimiter,
  validate(emailSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body as z.infer<typeof emailSchema>;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw ApiError.conflict('An account with this email already exists. Please sign in instead.');
    }

    try {
      await issueOtp('signup', email, 'there');
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw ApiError.badGateway('Could not send verification email. Please try again.');
    }

    res.json({ ok: true, message: 'Verification code sent to your email' });
  })
);

// POST /auth/signup/verify-otp — Step 1.4: verifies OTP, returns signupToken
router.post(
  '/signup/verify-otp',
  authLimiter,
  validate(codeSchema),
  asyncHandler(async (req, res) => {
    const { email, code } = req.body as z.infer<typeof codeSchema>;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw ApiError.conflict('An account with this email already exists. Please sign in instead.');
    }

    const check = await verifyOtp('signup', email, code);
    if (!check.ok) throw otpError(check);

    const signupToken = signSignupToken(email);
    res.json({ ok: true, signupToken });
  })
);

// POST /auth/register — Step 1.5 & 1.6: user created in DB after password confirmation
router.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, password, name, signupToken, inviteCode } = req.body as z.infer<typeof registerSchema>;
    const needsOtp = otpRequired();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw ApiError.conflict('An account with this email already exists');

    // Verify signupToken if provided or when OTP is required
    if (signupToken) {
      try {
        const verified = verifySignupToken(signupToken);
        if (verified.email.toLowerCase() !== email.toLowerCase()) {
          throw ApiError.badRequest('Verification token does not match email');
        }
      } catch {
        throw ApiError.badRequest('Invalid or expired signup verification token. Please verify email again.');
      }
    } else if (needsOtp && !env.isTest) {
      throw ApiError.badRequest('Email must be verified before completing registration');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    let user: { id: string; email: string; name: string; avatarColor: string; createdAt: Date };
    let joinedTeamId: string | null = null;
    let joinedRole: 'MEMBER' | 'ADMIN' | 'OWNER' | null = null;

    try {
      user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email,
            passwordHash,
            name,
            avatarColor: pickAvatarColor(email),
            emailVerifiedAt: new Date(),
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

        // Requirement 2.3: If registered from invitation link, auto-join team
        if (inviteCode) {
          const invite = await tx.invite.findUnique({ where: { code: inviteCode } });
          if (invite && inviteStatus(invite) === 'active') {
            await tx.teamMember.create({
              data: {
                teamId: invite.teamId,
                userId: created.id,
                role: invite.role,
              },
            });
            await tx.invite.update({
              where: { id: invite.id },
              data: { usedCount: { increment: 1 } },
            });
            joinedTeamId = invite.teamId;
            joinedRole = invite.role;
          }
        }

        return created;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw ApiError.conflict('An account with this email already exists');
      }
      throw err;
    }

    if (joinedTeamId && joinedRole) {
      emitTeamEvent(joinedTeamId, 'member:joined', { actorId: user.id }, {
        teamId: joinedTeamId,
        userId: user.id,
        role: joinedRole,
      });
      void notifyInviteRedeemed({ actorId: user.id, teamId: joinedTeamId }).catch(() => undefined);
    }

    setAuthCookie(res, signToken(user.id));
    res.status(201).json({ user, joinedTeamId });
  })
);

// POST /auth/verify-email — legacy support for unverified addresses
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
    } else if (!user) {
      // Also allow resending signup OTP
      await issueOtp('signup', email, 'there').catch(() => undefined);
    }

    res.status(202).json({ ok: true });
  })
);

// POST /auth/forgot-password — emails a reset code
router.post(
  '/forgot-password',
  authLimiter,
  validate(emailSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body as z.infer<typeof emailSchema>;
    if (!otpRequired()) {
      throw ApiError.serviceUnavailable(
        'Email is not configured on this server. Set SMTP_HOST in backend/.env.'
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
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      },
    });

    res.json({ ok: true });
  })
);

// POST /auth/login — fast and efficient: DB check + bcrypt compare + auto-join team if invited
router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password, inviteCode } = req.body as z.infer<typeof loginSchema>;

    const user = await prisma.user.findUnique({ where: { email } });
    const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !valid) throw ApiError.unauthorized('Invalid email or password');

    // Auto-verify if legacy unverified user logs in with valid password
    if (!user.emailVerifiedAt) {
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });
    }

    let joinedTeamId: string | null = null;
    // Requirement 2.3: If logging in from invitation link, auto-join team
    if (inviteCode) {
      try {
        const invite = await prisma.invite.findUnique({ where: { code: inviteCode } });
        if (invite && inviteStatus(invite) === 'active') {
          const existing = await prisma.teamMember.findUnique({
            where: { teamId_userId: { teamId: invite.teamId, userId: user.id } },
          });
          if (!existing) {
            await prisma.$transaction(async (tx) => {
              await tx.teamMember.create({
                data: { teamId: invite.teamId, userId: user.id, role: invite.role },
              });
              await tx.invite.update({
                where: { id: invite.id },
                data: { usedCount: { increment: 1 } },
              });
            });
            joinedTeamId = invite.teamId;
            emitTeamEvent(invite.teamId, 'member:joined', { actorId: user.id }, {
              teamId: invite.teamId,
              userId: user.id,
              role: invite.role,
            });
            void notifyInviteRedeemed({ actorId: user.id, teamId: invite.teamId }).catch(() => undefined);
          } else {
            joinedTeamId = invite.teamId;
          }
        }
      } catch (err) {
        console.error('Auto-joining team on login failed:', err);
      }
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
      joinedTeamId,
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
