import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loadBoardAccess } from '../middleware/permissions.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logActivity } from '../services/activityService.js';
import { clientEventId, emitBoardEvent } from '../realtime/socket.js';

const router = Router();
router.use(requireAuth);

const createLabelSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex value like #3b82f6')
    .optional(),
});

const updateLabelSchema = createLabelSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, 'No fields to update');

// POST /api/boards/:boardId/labels — ADMIN+ (managing the board's label set)
router.post(
  '/boards/:boardId/labels',
  validate(createLabelSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { board } = await loadBoardAccess(userId, req.params.boardId, 'ADMIN');
    const { name, color } = req.body as z.infer<typeof createLabelSchema>;

    const label = await prisma.label.create({
      data: { boardId: board.id, name, ...(color ? { color } : {}) },
    });

    await logActivity({
      actorId: userId,
      boardId: board.id,
      type: 'LABEL_CREATED',
      metadata: { name },
    });
    emitBoardEvent(board.id, 'label:created', { actorId: userId, clientEventId: clientEventId(req) }, { label });

    res.status(201).json({ label });
  })
);

// PATCH /api/labels/:id — ADMIN+
router.patch(
  '/labels/:id',
  validate(updateLabelSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const label = await prisma.label.findUnique({ where: { id: req.params.id } });
    if (!label) throw ApiError.notFound('Label not found');
    const { board } = await loadBoardAccess(userId, label.boardId, 'ADMIN');

    const body = req.body as z.infer<typeof updateLabelSchema>;
    const updated = await prisma.label.update({
      where: { id: label.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.color !== undefined ? { color: body.color } : {}),
      },
    });

    await logActivity({
      actorId: userId,
      boardId: board.id,
      type: 'LABEL_UPDATED',
      metadata: { name: updated.name },
    });
    emitBoardEvent(board.id, 'label:updated', { actorId: userId, clientEventId: clientEventId(req) }, { label: updated });

    res.json({ label: updated });
  })
);

// DELETE /api/labels/:id — ADMIN+ (cascades off cards via CardLabel)
router.delete(
  '/labels/:id',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const label = await prisma.label.findUnique({ where: { id: req.params.id } });
    if (!label) throw ApiError.notFound('Label not found');
    const { board } = await loadBoardAccess(userId, label.boardId, 'ADMIN');

    await prisma.label.delete({ where: { id: label.id } });

    await logActivity({
      actorId: userId,
      boardId: board.id,
      type: 'LABEL_DELETED',
      metadata: { name: label.name },
    });
    emitBoardEvent(board.id, 'label:deleted', { actorId: userId, clientEventId: clientEventId(req) }, { labelId: label.id });

    res.status(204).end();
  })
);

export default router;
