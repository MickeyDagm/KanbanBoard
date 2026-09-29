import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { publicUserSelect } from '../utils/selects.js';

const router = Router();
router.use(requireAuth);

const notificationInclude = {
  actor: publicUserSelect,
  card: { select: { id: true, title: true } },
  board: { select: { id: true, title: true } },
  team: { select: { id: true, name: true } },
} as const;

// GET /api/notifications?unread=1 — own notifications, newest first
router.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const unreadOnly = req.query.unread === '1';

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { recipientId: userId, ...(unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: notificationInclude,
      }),
      prisma.notification.count({ where: { recipientId: userId, readAt: null } }),
    ]);

    res.json({ notifications, unreadCount });
  })
);

// POST /api/notifications/:id/read — mark one as read (recipient only)
router.post(
  '/notifications/:id/read',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const existing = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.recipientId !== userId) throw ApiError.notFound('Notification not found');

    const notification = await prisma.notification.update({
      where: { id: existing.id },
      data: { readAt: existing.readAt ?? new Date() },
      include: notificationInclude,
    });
    res.json({ notification });
  })
);

// POST /api/notifications/read-all — mark everything as read
router.post(
  '/notifications/read-all',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { count } = await prisma.notification.updateMany({
      where: { recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ updated: count });
  })
);

export default router;
