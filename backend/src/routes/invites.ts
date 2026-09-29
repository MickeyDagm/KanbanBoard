import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Invite } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loadTeamAccess } from '../middleware/permissions.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { publicUserSelect } from '../utils/selects.js';
import { env } from '../config/env.js';
import { isEmailConfigured, sendInviteEmail } from '../services/emailService.js';
import { notifyInviteRedeemed } from '../services/notificationService.js';
import { clientEventId, emitTeamEvent } from '../realtime/socket.js';

const router = Router();
router.use(requireAuth);

const inviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.isTest,
});

const createInviteSchema = z.object({
  role: z.enum(['MEMBER', 'ADMIN']).default('MEMBER'),
  expiresInDays: z.number().int().min(1).max(365).default(30),
  maxUses: z.number().int().min(1).max(200).nullable().optional(),
});

const sendInviteSchema = createInviteSchema.extend({
  email: z.string().trim().email(),
});

const emailInviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.isTest,
});

type InviteStatus = 'active' | 'revoked' | 'expired' | 'maxed';

function inviteStatus(invite: Pick<Invite, 'revokedAt' | 'expiresAt' | 'maxUses' | 'usedCount'>): InviteStatus {
  if (invite.revokedAt) return 'revoked';
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) return 'expired';
  if (invite.maxUses !== null && invite.usedCount >= invite.maxUses) return 'maxed';
  return 'active';
}

function serializeInvite(invite: Invite) {
  return { ...invite, status: inviteStatus(invite) };
}

const newCode = () => randomBytes(9).toString('base64url');

interface InviteOptions {
  role: 'MEMBER' | 'ADMIN';
  expiresInDays: number;
  maxUses?: number | null;
}

async function createInviteRecord(teamId: string, createdById: string, opts: InviteOptions) {
  return prisma.invite.create({
    data: {
      code: newCode(),
      teamId,
      role: opts.role,
      createdById,
      maxUses: opts.maxUses ?? null,
      expiresAt: new Date(Date.now() + opts.expiresInDays * 24 * 60 * 60 * 1000),
    },
  });
}

const inviteUrl = (code: string) => `${env.publicUrl}/invite/${code}`;

// POST /api/teams/:teamId/invites — ADMIN+; invite links carry a role and expiry
router.post(
  '/teams/:teamId/invites',
  inviteLimiter,
  validate(createInviteSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { team } = await loadTeamAccess(userId, req.params.teamId, 'ADMIN');
    const { role, expiresInDays, maxUses } = req.body as z.infer<typeof createInviteSchema>;

    const invite = await createInviteRecord(team.id, userId, { role, expiresInDays, maxUses });

    res.status(201).json({
      invite: serializeInvite(invite),
      url: inviteUrl(invite.code),
    });
  })
);

// POST /api/teams/:teamId/invites/email — ADMIN+; creates an invite and emails
// the link to one address. Fails cleanly when SMTP is not configured.
router.post(
  '/teams/:teamId/invites/email',
  emailInviteLimiter,
  validate(sendInviteSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { team } = await loadTeamAccess(userId, req.params.teamId, 'ADMIN');
    const { email, role, expiresInDays, maxUses } = req.body as z.infer<typeof sendInviteSchema>;

    if (!isEmailConfigured()) {
      throw ApiError.serviceUnavailable(
        'Email is not configured on this server. Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS in backend/.env, then restart it.'
      );
    }

    const inviter = req.user!;
    const invite = await createInviteRecord(team.id, userId, { role, expiresInDays, maxUses });
    const url = inviteUrl(invite.code);

    try {
      await sendInviteEmail({
        to: email,
        teamName: team.name,
        inviterName: inviter.name,
        role,
        url,
        expiresAt: invite.expiresAt,
      });
    } catch (err) {
      // The link never reached anyone — don't leave a dangling invite behind.
      await prisma.invite.delete({ where: { id: invite.id } }).catch(() => undefined);
      console.error('Invite email failed:', err);
      throw ApiError.badGateway(
        'Could not send the invitation email. Check the SMTP settings in backend/.env.'
      );
    }

    res.status(201).json({
      invite: serializeInvite(invite),
      url,
      sentTo: email,
    });
  })
);

// GET /api/teams/:teamId/invites — ADMIN+
router.get(
  '/teams/:teamId/invites',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { team } = await loadTeamAccess(userId, req.params.teamId, 'ADMIN');

    const invites = await prisma.invite.findMany({
      where: { teamId: team.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ invites: invites.map(serializeInvite), emailConfigured: isEmailConfigured() });
  })
);

// DELETE /api/invites/:id — ADMIN+ (soft revoke)
router.delete(
  '/invites/:id',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const invite = await prisma.invite.findUnique({ where: { id: req.params.id } });
    if (!invite) throw ApiError.notFound('Invite not found');

    await loadTeamAccess(userId, invite.teamId, 'ADMIN');

    if (!invite.revokedAt) {
      await prisma.invite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } });
    }

    res.status(204).end();
  })
);

// GET /api/invites/:code — preview: team, role, inviter, validity, membership
router.get(
  '/invites/:code',
  inviteLimiter,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const invite = await prisma.invite.findUnique({
      where: { code: req.params.code },
      include: {
        team: { select: { id: true, name: true } },
        createdBy: { select: publicUserSelect.select },
      },
    });
    if (!invite) throw ApiError.notFound('Invite not found');

    const membership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: invite.teamId, userId } },
    });

    res.json({
      team: invite.team,
      role: invite.role,
      inviter: invite.createdBy,
      status: inviteStatus(invite),
      alreadyMember: !!membership,
    });
  })
);

// POST /api/invites/:code/redeem — logged-in user joins (idempotent)
router.post(
  '/invites/:code/redeem',
  inviteLimiter,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const invite = await prisma.invite.findUnique({
      where: { code: req.params.code },
      include: { team: { select: { id: true, name: true } } },
    });
    if (!invite) throw ApiError.notFound('Invite not found');

    const existing = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: invite.teamId, userId } },
    });
    if (existing) {
      res.json({ team: invite.team, role: existing.role, joined: false });
      return;
    }

    const status = inviteStatus(invite);
    if (status !== 'active') {
      throw ApiError.badRequest(
        status === 'revoked'
          ? 'This invite has been revoked'
          : status === 'expired'
            ? 'This invite has expired'
            : 'This invite has reached its use limit'
      );
    }

    const role = invite.role;
    const teamId = invite.teamId;
    const inviteId = invite.id;

    const member = await prisma.$transaction(async (tx) => {
      // Re-check inside the transaction to avoid double redemption races.
      const again = await tx.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId } },
      });
      if (again) return again;

      const fresh = await tx.invite.findUnique({ where: { id: inviteId } });
      if (!fresh || inviteStatus(fresh) !== 'active') {
        throw ApiError.badRequest('This invite is no longer valid');
      }

      const created = await tx.teamMember.create({ data: { teamId, userId, role } });
      await tx.invite.update({ where: { id: inviteId }, data: { usedCount: { increment: 1 } } });
      return created;
    });

    emitTeamEvent(teamId, 'member:joined', { actorId: userId, clientEventId: clientEventId(req) }, {
      teamId,
      userId,
      role: member.role,
    });
    await notifyInviteRedeemed({ actorId: userId, teamId });

    res.json({ team: invite.team, role: member.role, joined: true });
  })
);

export default router;
