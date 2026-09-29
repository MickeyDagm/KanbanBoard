import { Router } from 'express';
import authRouter from './auth.js';
import teamsRouter from './teams.js';
import boardsRouter from './boards.js';
import listsRouter from './lists.js';
import cardsRouter from './cards.js';
import labelsRouter from './labels.js';
import checklistsRouter from './checklists.js';
import commentsRouter from './comments.js';
import invitesRouter from './invites.js';
import notificationsRouter from './notifications.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    let database: 'up' | 'down' = 'up';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    res.json({ status: 'ok', database });
  })
);

router.use('/auth', authRouter);
router.use('/teams', teamsRouter);
router.use('/boards', boardsRouter);
// lists/cards/labels/checklists/comments routers declare their own full
// sub-paths (e.g. /boards/:boardId/lists, /lists/:listId/cards,
// /boards/:boardId/labels, /cards/:id/checklists, /cards/:id/comments) so they
// are mounted at the API root, after /boards.
router.use(listsRouter);
router.use(cardsRouter);
router.use(labelsRouter);
router.use(checklistsRouter);
router.use(commentsRouter);
// invites declares full sub-paths (/teams/:teamId/invites, /invites/:code) and
// must come after /teams so team-scoped routes there are matched first.
router.use(invitesRouter);
router.use(notificationsRouter);

export default router;
