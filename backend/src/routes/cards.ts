import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loadCardAccess, loadListAccess } from '../middleware/permissions.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { publicUserSelect } from '../utils/selects.js';
import { cardInclude, serializeCard } from '../utils/cards.js';
import { logActivity } from '../services/activityService.js';
import { notifyAssigned } from '../services/notificationService.js';
import { clientEventId, emitBoardEvent } from '../realtime/socket.js';

const router = Router();
router.use(requireAuth);

const dateString = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date');

const createCardSchema = z.object({
  title: z.string().trim().min(1).max(240),
});

const updateCardSchema = z
  .object({
    title: z.string().trim().min(1).max(240).optional(),
    description: z.string().max(10_000).optional(),
    dueDate: dateString.nullable().optional(),
    priority: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    cover: z.string().trim().max(32).nullable().optional(),
    done: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, 'No fields to update');

const moveCardSchema = z.object({
  listId: z.string().min(1).optional(),
  index: z.number().int().min(0),
});

const attachLabelSchema = z.object({ labelId: z.string().min(1) });
const assignSchema = z.object({ userId: z.string().min(1) });

// POST /api/lists/:listId/cards — MEMBER+
router.post(
  '/lists/:listId/cards',
  validate(createCardSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { list, board } = await loadListAccess(userId, req.params.listId, 'MEMBER');
    const { title } = req.body as z.infer<typeof createCardSchema>;

    const card = await prisma.$transaction(async (tx) => {
      const max = await tx.card.aggregate({ where: { listId: list.id }, _max: { position: true } });
      return tx.card.create({
        data: { listId: list.id, title, position: (max._max.position ?? -1) + 1, createdById: userId },
        include: cardInclude,
      });
    });

    await logActivity({
      actorId: userId,
      boardId: board.id,
      cardId: card.id,
      type: 'CARD_CREATED',
      metadata: { title },
    });
    emitBoardEvent(board.id, 'card:created', { actorId: userId, clientEventId: clientEventId(req) }, { card: serializeCard(card) });

    res.status(201).json({ card: serializeCard(card) });
  })
);

// GET /api/cards/:id — full detail (labels, assignees, checklists, comments, activity)
router.get(
  '/cards/:id',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { card } = await loadCardAccess(userId, req.params.id, 'MEMBER');

    const [detail, activity] = await Promise.all([
      prisma.card.findUnique({
        where: { id: card.id },
        include: {
          ...cardInclude,
          checklists: {
            orderBy: { position: 'asc' },
            include: { items: { orderBy: { position: 'asc' } } },
          },
          comments: {
            orderBy: { createdAt: 'asc' },
            include: { author: publicUserSelect },
          },
        },
      }),
      prisma.activity.findMany({
        where: { cardId: card.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { actor: publicUserSelect },
      }),
    ]);

    if (!detail) throw ApiError.notFound('Card not found');

    res.json({ card: serializeCard(detail), activity });
  })
);

// PATCH /api/cards/:id — MEMBER+
router.patch(
  '/cards/:id',
  validate(updateCardSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { card, board } = await loadCardAccess(userId, req.params.id, 'MEMBER');
    const body = req.body as z.infer<typeof updateCardSchema>;

    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.cover !== undefined) data.cover = body.cover;
    if (body.dueDate !== undefined) data.dueDate = body.dueDate === null ? null : new Date(body.dueDate);
    if (body.done !== undefined) data.done = body.done;

    const updated = await prisma.card.update({
      where: { id: card.id },
      data,
      include: cardInclude,
    });

    await logActivity({
      actorId: userId,
      boardId: board.id,
      cardId: card.id,
      type: 'CARD_UPDATED',
      metadata: { fields: Object.keys(data), done: body.done },
    });
    emitBoardEvent(board.id, 'card:updated', { actorId: userId, clientEventId: clientEventId(req) }, { card: serializeCard(updated) });

    res.json({ card: serializeCard(updated) });
  })
);

// DELETE /api/cards/:id — MEMBER+
router.delete(
  '/cards/:id',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { card, board } = await loadCardAccess(userId, req.params.id, 'MEMBER');

    await prisma.card.delete({ where: { id: card.id } });

    await logActivity({
      actorId: userId,
      boardId: board.id,
      type: 'CARD_DELETED',
      metadata: { title: card.title },
    });
    emitBoardEvent(board.id, 'card:deleted', { actorId: userId, clientEventId: clientEventId(req) }, { cardId: card.id });

    res.status(204).end();
  })
);

// POST /api/cards/:id/move — MEMBER+; single transaction, reindexes both lists
router.post(
  '/cards/:id/move',
  validate(moveCardSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { card, board } = await loadCardAccess(userId, req.params.id, 'MEMBER');
    const { listId, index } = req.body as z.infer<typeof moveCardSchema>;

    const targetListId = listId ?? card.listId;

    const updated = await prisma.$transaction(async (tx) => {
      if (targetListId !== card.listId) {
        const targetList = await tx.list.findFirst({
          where: { id: targetListId, boardId: board.id },
        });
        if (!targetList) throw ApiError.notFound('Target list not found');
      }

      // Ordered ids of the target list without the moving card
      const targetCards = await tx.card.findMany({
        where: { listId: targetListId, id: { not: card.id } },
        orderBy: { position: 'asc' },
        select: { id: true },
      });

      const clampedIndex = Math.min(index, targetCards.length);
      const targetOrder = targetCards.map((c) => c.id);
      targetOrder.splice(clampedIndex, 0, card.id);

      for (let i = 0; i < targetOrder.length; i++) {
        await tx.card.update({
          where: { id: targetOrder[i] },
          data: { position: i, ...(targetOrder[i] === card.id ? { listId: targetListId } : {}) },
        });
      }

      // Reindex the source list when the card moved across lists
      if (targetListId !== card.listId) {
        const sourceCards = await tx.card.findMany({
          where: { listId: card.listId },
          orderBy: { position: 'asc' },
          select: { id: true },
        });
        for (let i = 0; i < sourceCards.length; i++) {
          await tx.card.update({ where: { id: sourceCards[i].id }, data: { position: i } });
        }
      }

      return tx.card.findUnique({ where: { id: card.id }, include: cardInclude });
    });

    await logActivity({
      actorId: userId,
      boardId: board.id,
      cardId: card.id,
      type: 'CARD_MOVED',
      metadata: {
        fromListId: card.listId,
        toListId: targetListId,
        index,
        title: card.title,
      },
    });
    if (updated) {
      emitBoardEvent(
        board.id,
        'card:moved',
        { actorId: userId, clientEventId: clientEventId(req) },
        { card: serializeCard(updated), fromListId: card.listId, toListId: targetListId, index: updated.position }
      );
    }

    res.json({ card: updated ? serializeCard(updated) : null });
  })
);

// ── Labels on cards — MEMBER+ ───────────────────────────────────────────────

// POST /api/cards/:id/labels — attach an existing board label
router.post(
  '/cards/:id/labels',
  validate(attachLabelSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { card, board } = await loadCardAccess(userId, req.params.id, 'MEMBER');
    const { labelId } = req.body as z.infer<typeof attachLabelSchema>;

    const label = await prisma.label.findUnique({ where: { id: labelId } });
    if (!label || label.boardId !== board.id) throw ApiError.notFound('Label not found');

    const existing = await prisma.cardLabel.findUnique({
      where: { cardId_labelId: { cardId: card.id, labelId } },
    });
    if (existing) throw ApiError.conflict('Label already attached');

    await prisma.cardLabel.create({ data: { cardId: card.id, labelId } });
    const updated = await prisma.card.findUnique({ where: { id: card.id }, include: cardInclude });

    await logActivity({
      actorId: userId,
      boardId: board.id,
      cardId: card.id,
      type: 'CARD_UPDATED',
      metadata: { fields: ['labels'] },
    });
    if (updated) {
      emitBoardEvent(board.id, 'card:updated', { actorId: userId, clientEventId: clientEventId(req) }, { card: serializeCard(updated) });
    }

    res.status(201).json({ card: updated ? serializeCard(updated) : null });
  })
);

// DELETE /api/cards/:id/labels/:labelId — detach
router.delete(
  '/cards/:id/labels/:labelId',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { card, board } = await loadCardAccess(userId, req.params.id, 'MEMBER');

    const existing = await prisma.cardLabel.findUnique({
      where: { cardId_labelId: { cardId: card.id, labelId: req.params.labelId } },
    });
    if (!existing) throw ApiError.notFound('Label not attached');

    await prisma.cardLabel.delete({
      where: { cardId_labelId: { cardId: card.id, labelId: req.params.labelId } },
    });
    const updated = await prisma.card.findUnique({ where: { id: card.id }, include: cardInclude });

    await logActivity({
      actorId: userId,
      boardId: board.id,
      cardId: card.id,
      type: 'CARD_UPDATED',
      metadata: { fields: ['labels'] },
    });
    if (updated) {
      emitBoardEvent(board.id, 'card:updated', { actorId: userId, clientEventId: clientEventId(req) }, { card: serializeCard(updated) });
    }

    res.status(204).end();
  })
);

// ── Assignees — MEMBER+ (assignees must belong to the board's team) ────────

// POST /api/cards/:id/assignees
router.post(
  '/cards/:id/assignees',
  validate(assignSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { card, board } = await loadCardAccess(userId, req.params.id, 'MEMBER');
    const { userId: assigneeId } = req.body as z.infer<typeof assignSchema>;

    const membership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: board.teamId, userId: assigneeId } },
    });
    if (!membership) throw ApiError.notFound('User not found');

    const existing = await prisma.cardAssignee.findUnique({
      where: { cardId_userId: { cardId: card.id, userId: assigneeId } },
    });
    if (existing) throw ApiError.conflict('User already assigned');

    await prisma.cardAssignee.create({ data: { cardId: card.id, userId: assigneeId } });
    const updated = await prisma.card.findUnique({ where: { id: card.id }, include: cardInclude });

    await logActivity({
      actorId: userId,
      boardId: board.id,
      cardId: card.id,
      type: 'CARD_UPDATED',
      metadata: { fields: ['assignees'], assigned: assigneeId },
    });
    await notifyAssigned({ actorId: userId, assigneeId, cardId: card.id, boardId: board.id });
    if (updated) {
      emitBoardEvent(board.id, 'card:updated', { actorId: userId, clientEventId: clientEventId(req) }, { card: serializeCard(updated) });
      // Open detail modals refetch so their activity feed gains the assign entry.
      emitBoardEvent(board.id, 'card:detail:changed', { actorId: userId, clientEventId: clientEventId(req) }, { cardId: card.id });
    }

    res.status(201).json({ card: updated ? serializeCard(updated) : null });
  })
);

// DELETE /api/cards/:id/assignees/:userId
router.delete(
  '/cards/:id/assignees/:assigneeId',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { card, board } = await loadCardAccess(userId, req.params.id, 'MEMBER');

    const existing = await prisma.cardAssignee.findUnique({
      where: { cardId_userId: { cardId: card.id, userId: req.params.assigneeId } },
    });
    if (!existing) throw ApiError.notFound('User not assigned');

    await prisma.cardAssignee.delete({
      where: { cardId_userId: { cardId: card.id, userId: req.params.assigneeId } },
    });
    const updated = await prisma.card.findUnique({ where: { id: card.id }, include: cardInclude });

    await logActivity({
      actorId: userId,
      boardId: board.id,
      cardId: card.id,
      type: 'CARD_UPDATED',
      metadata: { fields: ['assignees'], unassigned: req.params.assigneeId },
    });
    if (updated) {
      emitBoardEvent(board.id, 'card:updated', { actorId: userId, clientEventId: clientEventId(req) }, { card: serializeCard(updated) });
      emitBoardEvent(board.id, 'card:detail:changed', { actorId: userId, clientEventId: clientEventId(req) }, { cardId: card.id });
    }

    res.status(204).end();
  })
);

export default router;
