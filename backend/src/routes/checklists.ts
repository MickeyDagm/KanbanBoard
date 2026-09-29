import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loadCardAccess } from '../middleware/permissions.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { cardInclude, serializeCard } from '../utils/cards.js';
import { clientEventId, emitBoardEvent } from '../realtime/socket.js';

const router = Router();
router.use(requireAuth);

const titleSchema = z.string().trim().min(1).max(200);
const textSchema = z.string().trim().min(1).max(500);

const createChecklistSchema = z.object({ title: titleSchema });
const updateChecklistSchema = z.object({ title: titleSchema.optional() }).refine(
  (data) => Object.keys(data).length > 0,
  'No fields to update'
);
const createItemSchema = z.object({ text: textSchema });
const updateItemSchema = z
  .object({ text: textSchema.optional(), done: z.boolean().optional() })
  .refine((data) => Object.keys(data).length > 0, 'No fields to update');

/** Detail-only data: tell any open card modal to refetch (board cache unaffected). */
function emitDetailChanged(boardId: string, cardId: string, actorId: string, req: Parameters<typeof clientEventId>[0]) {
  emitBoardEvent(boardId, 'card:detail:changed', { actorId, clientEventId: clientEventId(req) }, { cardId });
}

/** Checklist create/delete changes board-card _count → refresh cards everywhere too. */
async function emitCardAndDetail(boardId: string, cardId: string, actorId: string, req: Parameters<typeof clientEventId>[0]) {
  const card = await prisma.card.findUnique({ where: { id: cardId }, include: cardInclude });
  if (card) {
    emitBoardEvent(boardId, 'card:updated', { actorId, clientEventId: clientEventId(req) }, { card: serializeCard(card) });
  }
  emitDetailChanged(boardId, cardId, actorId, req);
}

async function loadChecklistAccess(userId: string, checklistId: string) {
  const checklist = await prisma.checklist.findUnique({ where: { id: checklistId } });
  if (!checklist) throw ApiError.notFound('Checklist not found');
  const access = await loadCardAccess(userId, checklist.cardId, 'MEMBER');
  return { checklist, ...access };
}

async function loadItemAccess(userId: string, itemId: string) {
  const item = await prisma.checklistItem.findUnique({ where: { id: itemId } });
  if (!item) throw ApiError.notFound('Checklist item not found');
  const access = await loadChecklistAccess(userId, item.checklistId);
  return { item, ...access };
}

// POST /api/cards/:id/checklists — MEMBER+
router.post(
  '/cards/:id/checklists',
  validate(createChecklistSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { card, board } = await loadCardAccess(userId, req.params.id, 'MEMBER');
    const { title } = req.body as z.infer<typeof createChecklistSchema>;

    const max = await prisma.checklist.aggregate({
      where: { cardId: card.id },
      _max: { position: true },
    });
    const checklist = await prisma.checklist.create({
      data: { cardId: card.id, title, position: (max._max.position ?? -1) + 1 },
      include: { items: true },
    });

    await emitCardAndDetail(board.id, card.id, userId, req);
    res.status(201).json({ checklist });
  })
);

// PATCH /api/checklists/:id — MEMBER+
router.patch(
  '/checklists/:id',
  validate(updateChecklistSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { checklist, card, board } = await loadChecklistAccess(userId, req.params.id);
    const { title } = req.body as z.infer<typeof updateChecklistSchema>;

    const updated = await prisma.checklist.update({
      where: { id: checklist.id },
      data: { ...(title !== undefined ? { title } : {}) },
      include: { items: { orderBy: { position: 'asc' } } },
    });

    emitDetailChanged(board.id, card.id, userId, req);
    res.json({ checklist: updated });
  })
);

// DELETE /api/checklists/:id — MEMBER+
router.delete(
  '/checklists/:id',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { checklist, card, board } = await loadChecklistAccess(userId, req.params.id);

    await prisma.checklist.delete({ where: { id: checklist.id } });

    await emitCardAndDetail(board.id, card.id, userId, req);
    res.status(204).end();
  })
);

// POST /api/checklists/:id/items — MEMBER+
router.post(
  '/checklists/:id/items',
  validate(createItemSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { checklist, card, board } = await loadChecklistAccess(userId, req.params.id);
    const { text } = req.body as z.infer<typeof createItemSchema>;

    const max = await prisma.checklistItem.aggregate({
      where: { checklistId: checklist.id },
      _max: { position: true },
    });
    const item = await prisma.checklistItem.create({
      data: { checklistId: checklist.id, text, position: (max._max.position ?? -1) + 1 },
    });

    emitDetailChanged(board.id, card.id, userId, req);
    res.status(201).json({ item });
  })
);

// PATCH /api/checklist-items/:id — MEMBER+
router.patch(
  '/checklist-items/:id',
  validate(updateItemSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { item, card, board } = await loadItemAccess(userId, req.params.id);
    const body = req.body as z.infer<typeof updateItemSchema>;

    const updated = await prisma.checklistItem.update({
      where: { id: item.id },
      data: {
        ...(body.text !== undefined ? { text: body.text } : {}),
        ...(body.done !== undefined ? { done: body.done } : {}),
      },
    });

    emitDetailChanged(board.id, card.id, userId, req);
    res.json({ item: updated });
  })
);

// DELETE /api/checklist-items/:id — MEMBER+
router.delete(
  '/checklist-items/:id',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { item, card, board } = await loadItemAccess(userId, req.params.id);

    await prisma.checklistItem.delete({ where: { id: item.id } });

    emitDetailChanged(board.id, card.id, userId, req);
    res.status(204).end();
  })
);

export default router;
