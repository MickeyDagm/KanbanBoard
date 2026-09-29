import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { hasRole, loadCardAccess } from '../middleware/permissions.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { publicUserSelect } from '../utils/selects.js';
import { cardInclude, serializeCard } from '../utils/cards.js';
import { logActivity } from '../services/activityService.js';
import { notifyCommented, notifyMentioned, parseMentions } from '../services/notificationService.js';
import { clientEventId, emitBoardEvent } from '../realtime/socket.js';

const router = Router();
router.use(requireAuth);

const bodySchema = z.object({ body: z.string().trim().min(1).max(10_000) });

async function loadCommentAccess(userId: string, commentId: string) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw ApiError.notFound('Comment not found');
  const access = await loadCardAccess(userId, comment.cardId, 'MEMBER');
  return { comment, ...access };
}

function emitDetailChanged(boardId: string, cardId: string, actorId: string, req: Parameters<typeof clientEventId>[0]) {
  emitBoardEvent(boardId, 'card:detail:changed', { actorId, clientEventId: clientEventId(req) }, { cardId });
}

/** Comment create/delete changes board-card _count → refresh cards everywhere too. */
async function emitCardAndDetail(boardId: string, cardId: string, actorId: string, req: Parameters<typeof clientEventId>[0]) {
  const card = await prisma.card.findUnique({ where: { id: cardId }, include: cardInclude });
  if (card) {
    emitBoardEvent(boardId, 'card:updated', { actorId, clientEventId: clientEventId(req) }, { card: serializeCard(card) });
  }
  emitDetailChanged(boardId, cardId, actorId, req);
}

// GET /api/cards/:id/comments — MEMBER+
router.get(
  '/cards/:id/comments',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { card } = await loadCardAccess(userId, req.params.id, 'MEMBER');
    const comments = await prisma.comment.findMany({
      where: { cardId: card.id },
      orderBy: { createdAt: 'asc' },
      include: { author: publicUserSelect },
    });
    res.json({ comments });
  })
);

// POST /api/cards/:id/comments — MEMBER+
router.post(
  '/cards/:id/comments',
  validate(bodySchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { card, board } = await loadCardAccess(userId, req.params.id, 'MEMBER');
    const { body } = req.body as z.infer<typeof bodySchema>;

    const comment = await prisma.comment.create({
      data: { cardId: card.id, authorId: userId, body },
      include: { author: publicUserSelect },
    });

    await logActivity({
      actorId: userId,
      boardId: board.id,
      cardId: card.id,
      type: 'COMMENT_ADDED',
      metadata: { commentId: comment.id },
    });

    // Mentions first; they are excluded from the broader COMMENTED audience.
    const members = await prisma.teamMember.findMany({
      where: { teamId: board.teamId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    const mentionedIds = parseMentions(
      body,
      members.map((m) => m.user)
    );
    await notifyMentioned({ actorId: userId, mentionedIds, cardId: card.id, boardId: board.id });
    await notifyCommented({ actorId: userId, cardId: card.id, boardId: board.id, excludeIds: mentionedIds });

    await emitCardAndDetail(board.id, card.id, userId, req);

    res.status(201).json({ comment });
  })
);

// PATCH /api/comments/:id — author only
router.patch(
  '/comments/:id',
  validate(bodySchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { comment, card, board } = await loadCommentAccess(userId, req.params.id);
    if (comment.authorId !== userId) throw ApiError.forbidden('You can only edit your own comments');
    const { body } = req.body as z.infer<typeof bodySchema>;

    const updated = await prisma.comment.update({
      where: { id: comment.id },
      data: { body },
      include: { author: publicUserSelect },
    });

    await logActivity({
      actorId: userId,
      boardId: board.id,
      cardId: card.id,
      type: 'COMMENT_UPDATED',
      metadata: { commentId: comment.id },
    });
    emitDetailChanged(board.id, card.id, userId, req);

    res.json({ comment: updated });
  })
);

// DELETE /api/comments/:id — author or board ADMIN+
router.delete(
  '/comments/:id',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { comment, card, board, role } = await loadCommentAccess(userId, req.params.id);
    const isAuthor = comment.authorId === userId;
    if (!isAuthor && !hasRole(role, 'ADMIN')) {
      throw ApiError.forbidden('You can only delete your own comments');
    }

    await prisma.comment.delete({ where: { id: comment.id } });

    await logActivity({
      actorId: userId,
      boardId: board.id,
      cardId: card.id,
      type: 'COMMENT_DELETED',
      metadata: { commentId: comment.id },
    });
    await emitCardAndDetail(board.id, card.id, userId, req);

    res.status(204).end();
  })
);

export default router;
