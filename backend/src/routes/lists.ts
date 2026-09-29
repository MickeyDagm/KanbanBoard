import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loadBoardAccess, loadListAccess } from '../middleware/permissions.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logActivity } from '../services/activityService.js';
import { clientEventId, emitBoardEvent } from '../realtime/socket.js';

const router = Router();
router.use(requireAuth);

const createListSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

const updateListSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

// POST /api/boards/:boardId/lists — MEMBER+
router.post(
  '/boards/:boardId/lists',
  validate(createListSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { board } = await loadBoardAccess(userId, req.params.boardId, 'MEMBER');
    const { title } = req.body as z.infer<typeof createListSchema>;

    const list = await prisma.$transaction(async (tx) => {
      const max = await tx.list.aggregate({ where: { boardId: board.id }, _max: { position: true } });
      return tx.list.create({
        data: { boardId: board.id, title, position: (max._max.position ?? -1) + 1 },
      });
    });

    await logActivity({
      actorId: userId,
      boardId: board.id,
      type: 'LIST_CREATED',
      metadata: { title },
    });
    emitBoardEvent(board.id, 'list:created', { actorId: userId, clientEventId: clientEventId(req) }, { list });

    res.status(201).json({ list });
  })
);

// PATCH /api/lists/:id — MEMBER+
router.patch(
  '/lists/:id',
  validate(updateListSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { list, board } = await loadListAccess(userId, req.params.id, 'MEMBER');
    const { title } = req.body as z.infer<typeof updateListSchema>;

    const updated = await prisma.list.update({ where: { id: list.id }, data: { title } });

    await logActivity({
      actorId: userId,
      boardId: board.id,
      type: 'LIST_UPDATED',
      metadata: { title },
    });
    emitBoardEvent(board.id, 'list:updated', { actorId: userId, clientEventId: clientEventId(req) }, { list: updated });

    res.json({ list: updated });
  })
);

// DELETE /api/lists/:id — MEMBER+
router.delete(
  '/lists/:id',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { list, board } = await loadListAccess(userId, req.params.id, 'MEMBER');

    await prisma.list.delete({ where: { id: list.id } });

    await logActivity({
      actorId: userId,
      boardId: board.id,
      type: 'LIST_DELETED',
      metadata: { title: list.title },
    });
    emitBoardEvent(board.id, 'list:deleted', { actorId: userId, clientEventId: clientEventId(req) }, { listId: list.id });

    res.status(204).end();
  })
);

export default router;
