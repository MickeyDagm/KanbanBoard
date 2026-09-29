import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { hasRole, loadTeamAccess } from '../middleware/permissions.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { publicUserSelect } from '../utils/selects.js';
import { clientEventId, emitTeamEvent } from '../realtime/socket.js';

const router = Router();
router.use(requireAuth);

const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

const updateTeamSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

const updateRoleSchema = z.object({
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']),
});

const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

const memberSelect = {
  include: { user: { select: publicUserSelect.select } },
  orderBy: { joinedAt: 'asc' } as const,
};

function serializeMember(m: {
  teamId: string;
  userId: string;
  role: string;
  joinedAt: Date;
  user: { id: string; email: string; name: string; avatarColor: string };
}) {
  return { teamId: m.teamId, userId: m.userId, role: m.role, joinedAt: m.joinedAt, user: m.user };
}

async function ownerCount(teamId: string) {
  return prisma.teamMember.count({ where: { teamId, role: 'OWNER' } });
}

// GET /api/teams — teams the current user belongs to, with their role
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const memberships = await prisma.teamMember.findMany({
      where: { userId: req.user!.id },
      include: {
        team: { include: { _count: { select: { members: true } } } },
      },
      orderBy: { joinedAt: 'asc' },
    });

    res.json({
      teams: memberships.map((m) => ({
        ...m.team,
        role: m.role,
        memberCount: m.team._count.members,
      })),
    });
  })
);

// POST /api/teams — any authenticated user; creator becomes OWNER
router.post(
  '/',
  validate(createTeamSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { name } = req.body as z.infer<typeof createTeamSchema>;

    const team = await prisma.team.create({
      data: {
        name,
        createdById: userId,
        members: { create: { userId, role: 'OWNER' } },
      },
    });

    res.status(201).json({ team: { ...team, role: 'OWNER', memberCount: 1 } });
  })
);

// GET /api/teams/:id — team with members (any member can view)
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { team, role } = await loadTeamAccess(userId, req.params.id, 'MEMBER');

    const full = await prisma.team.findUnique({
      where: { id: team.id },
      include: { members: memberSelect, _count: { select: { members: true } } },
    });
    if (!full) throw ApiError.notFound('Team not found');

    res.json({
      team: {
        id: full.id,
        name: full.name,
        createdById: full.createdById,
        createdAt: full.createdAt,
        updatedAt: full.updatedAt,
      },
      members: full.members.map(serializeMember),
      role,
      memberCount: full._count.members,
    });
  })
);

// PATCH /api/teams/:id — ADMIN+
router.patch(
  '/:id',
  validate(updateTeamSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { team, role } = await loadTeamAccess(userId, req.params.id, 'ADMIN');
    const { name } = req.body as z.infer<typeof updateTeamSchema>;

    const updated = await prisma.team.update({ where: { id: team.id }, data: { name } });
    emitTeamEvent(team.id, 'team:updated', { actorId: userId, clientEventId: clientEventId(req) }, { team: updated });

    res.json({ team: { ...updated, role } });
  })
);

// DELETE /api/teams/:id — OWNER (cascades members, invites, boards)
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { team } = await loadTeamAccess(userId, req.params.id, 'OWNER');

    await prisma.team.delete({ where: { id: team.id } });
    emitTeamEvent(team.id, 'team:deleted', { actorId: userId, clientEventId: clientEventId(req) }, { teamId: team.id });

    res.status(204).end();
  })
);

// PATCH /api/teams/:id/members/:userId — ADMIN+ (see rules below)
router.patch(
  '/:id/members/:userId',
  validate(updateRoleSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { team, role: myRole } = await loadTeamAccess(userId, req.params.id, 'ADMIN');
    const targetUserId = req.params.userId;
    const { role: newRole } = req.body as z.infer<typeof updateRoleSchema>;

    const target = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: team.id, userId: targetUserId } },
      include: { user: { select: publicUserSelect.select } },
    });
    if (!target) throw ApiError.notFound('Member not found');

    if (target.role === 'OWNER' && myRole !== 'OWNER') {
      throw ApiError.forbidden('Only an owner can change an owner’s role');
    }
    if (newRole === 'OWNER' && myRole !== 'OWNER') {
      throw ApiError.forbidden('Only an owner can grant ownership');
    }
    if (target.role === 'OWNER' && newRole !== 'OWNER' && (await ownerCount(team.id)) <= 1) {
      throw ApiError.conflict('A team must have at least one owner');
    }

    const updated = await prisma.teamMember.update({
      where: { teamId_userId: { teamId: team.id, userId: targetUserId } },
      data: { role: newRole },
      include: { user: { select: publicUserSelect.select } },
    });

    emitTeamEvent(
      team.id,
      'member:role_changed',
      { actorId: userId, clientEventId: clientEventId(req) },
      { teamId: team.id, userId: targetUserId, role: newRole }
    );

    res.json({ member: serializeMember(updated) });
  })
);

// DELETE /api/teams/:id/members/:userId — self (leave) or ADMIN+ removing others
router.delete(
  '/:id/members/:userId',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const targetUserId = req.params.userId;
    const { team, role: myRole } = await loadTeamAccess(userId, req.params.id, 'MEMBER');
    const isSelf = targetUserId === userId;

    if (!isSelf && !hasRole(myRole, 'ADMIN')) {
      throw ApiError.forbidden('Only an admin can remove members');
    }

    const target = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: team.id, userId: targetUserId } },
    });
    if (!target) throw ApiError.notFound('Member not found');

    if (target.role === 'OWNER' && !isSelf && myRole !== 'OWNER') {
      throw ApiError.forbidden('Only an owner can remove an owner');
    }
    if (target.role === 'OWNER' && (await ownerCount(team.id)) <= 1) {
      throw ApiError.conflict('A team must have at least one owner');
    }

    await prisma.teamMember.delete({
      where: { teamId_userId: { teamId: team.id, userId: targetUserId } },
    });

    emitTeamEvent(
      team.id,
      'member:removed',
      { actorId: userId, clientEventId: clientEventId(req) },
      { teamId: team.id, userId: targetUserId }
    );

    res.status(204).end();
  })
);

// POST /api/teams/:id/members — ADMIN+, add an existing user by email
router.post(
  '/:id/members',
  validate(addMemberSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { team } = await loadTeamAccess(userId, req.params.id, 'ADMIN');
    const { email } = req.body as z.infer<typeof addMemberSchema>;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw ApiError.notFound('No account with that email');

    const existing = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: team.id, userId: user.id } },
    });
    if (existing) throw ApiError.conflict('That user is already a member of this team');

    const member = await prisma.teamMember.create({
      data: { teamId: team.id, userId: user.id, role: 'MEMBER' },
      include: { user: { select: publicUserSelect.select } },
    });

    emitTeamEvent(
      team.id,
      'member:joined',
      { actorId: userId, clientEventId: clientEventId(req) },
      { teamId: team.id, userId: user.id, role: 'MEMBER' }
    );

    res.status(201).json({ member: serializeMember(member) });
  })
);

export default router;
