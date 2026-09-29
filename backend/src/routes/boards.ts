import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loadBoardAccess, loadTeamAccess } from '../middleware/permissions.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { publicUserSelect } from '../utils/selects.js';
import { logActivity } from '../services/activityService.js';
import { clientEventId, emitTeamEvent } from '../realtime/socket.js';

const router = Router();
router.use(requireAuth);

const createBoardSchema = z.object({
  teamId: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
});

const updateBoardSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  background: z.string().trim().max(32).optional(),
});

const listQuerySchema = z.object({
  teamId: z.string().optional(),
});

// GET /api/boards?teamId=
router.get(
  '/',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { teamId } = req.query as { teamId?: string };

    const memberships = await prisma.teamMember.findMany({
      where: { userId },
      select: { teamId: true, role: true, team: { select: { id: true, name: true } } },
    });

    let teamIds = memberships.map((m) => m.teamId);
    const membershipByTeam = new Map(memberships.map((m) => [m.teamId, m.role]));

    if (teamId) {
      if (!teamIds.includes(teamId)) throw ApiError.notFound('Team not found');
      teamIds = [teamId];
    }

    const boards = await prisma.board.findMany({
      where: { teamId: { in: teamIds } },
      include: { team: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      boards: boards.map((b) => ({
        ...b,
        role: membershipByTeam.get(b.teamId) ?? null,
      })),
    });
  })
);

// POST /api/boards — ADMIN+ of the target team
router.post(
  '/',
  validate(createBoardSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { teamId, title, description } = req.body as z.infer<typeof createBoardSchema>;

    await loadTeamAccess(userId, teamId, 'ADMIN');

    const board = await prisma.board.create({
      data: { teamId, title, description: description ?? null, createdById: userId },
    });

    await logActivity({ actorId: userId, boardId: board.id, type: 'BOARD_CREATED', metadata: { title } });
    emitTeamEvent(teamId, 'board:created', { actorId: userId, clientEventId: clientEventId(req) }, { board });

    res.status(201).json({ board });
  })
);

// GET /api/boards/:id — full payload: lists + cards + labels + members + my role
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { board, role } = await loadBoardAccess(userId, req.params.id, 'MEMBER');

    const team = await prisma.team.findUnique({
      where: { id: board.teamId },
      include: { members: { include: { user: publicUserSelect }, orderBy: { joinedAt: 'asc' } } },
    });

    const [lists, labels] = await Promise.all([
      prisma.list.findMany({ where: { boardId: board.id }, orderBy: { position: 'asc' } }),
      prisma.label.findMany({ where: { boardId: board.id }, orderBy: { name: 'asc' } }),
    ]);

    const cards = await prisma.card.findMany({
      where: { list: { boardId: board.id } },
      include: {
        labels: { include: { label: true } },
        assignees: { include: { user: publicUserSelect } },
        _count: { select: { checklists: true, comments: true } },
      },
      orderBy: [{ listId: 'asc' }, { position: 'asc' }],
    });

    res.json({
      board,
      membership: { role, teamId: board.teamId },
      lists,
      cards: cards.map((c) => ({
        ...c,
        labels: c.labels.map((cl) => cl.label),
        assignees: c.assignees.map((a) => a.user),
      })),
      labels,
      members: team?.members.map((m) => ({ ...m.user, role: m.role })) ?? [],
    });
  })
);

// PATCH /api/boards/:id — ADMIN+
router.patch(
  '/:id',
  validate(updateBoardSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { board } = await loadBoardAccess(userId, req.params.id, 'ADMIN');
    const data = req.body as z.infer<typeof updateBoardSchema>;

    const updated = await prisma.board.update({ where: { id: board.id }, data });

    await logActivity({
      actorId: userId,
      boardId: board.id,
      type: 'BOARD_UPDATED',
      metadata: { fields: Object.keys(data) },
    });
    emitTeamEvent(board.teamId, 'board:updated', { actorId: userId, clientEventId: clientEventId(req) }, { board: updated });

    res.json({ board: updated });
  })
);

// DELETE /api/boards/:id — ADMIN+
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { board } = await loadBoardAccess(userId, req.params.id, 'ADMIN');

    await prisma.board.delete({ where: { id: board.id } });
    emitTeamEvent(board.teamId, 'board:deleted', { actorId: userId, clientEventId: clientEventId(req) }, { boardId: board.id });
    res.status(204).end();
  })
);

export default router;
