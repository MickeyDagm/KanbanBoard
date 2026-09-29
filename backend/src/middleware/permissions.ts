import type { Role } from '@prisma/client';
import { ApiError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

const ROLE_RANK: Record<Role, number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };

export function hasRole(role: Role, minRole: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

type BoardWithTeamMember = Awaited<ReturnType<typeof findBoardWithMembership>>;

async function findBoardWithMembership(boardId: string, userId: string) {
  return prisma.board.findUnique({
    where: { id: boardId },
    include: {
      team: {
        include: {
          members: { where: { userId } },
        },
      },
    },
  });
}

/**
 * Load a board and the current user's team membership.
 * Throws 404 when the board does not exist OR the user is not a team member
 * (never leak existence of boards the user cannot see).
 * Throws 403 when the member's role is below `minRole`.
 */
export async function loadBoardAccess(userId: string, boardId: string, minRole: Role = 'MEMBER') {
  const board: BoardWithTeamMember = await findBoardWithMembership(boardId, userId);
  if (!board) throw ApiError.notFound('Board not found');

  const membership = board.team.members[0];
  if (!membership) throw ApiError.notFound('Board not found');
  if (!hasRole(membership.role, minRole)) {
    throw ApiError.forbidden('You do not have permission to perform this action');
  }

  return { board, membership, role: membership.role };
}

export async function loadListAccess(userId: string, listId: string, minRole: Role = 'MEMBER') {
  const list = await prisma.list.findUnique({ where: { id: listId } });
  if (!list) throw ApiError.notFound('List not found');
  const access = await loadBoardAccess(userId, list.boardId, minRole);
  return { list, ...access };
}

export async function loadCardAccess(userId: string, cardId: string, minRole: Role = 'MEMBER') {
  const card = await prisma.card.findUnique({ where: { id: cardId }, include: { list: true } });
  if (!card) throw ApiError.notFound('Card not found');
  const access = await loadBoardAccess(userId, card.list.boardId, minRole);
  return { card, ...access };
}

/** Team-level access (used by board creation / future team routes). */
export async function loadTeamAccess(userId: string, teamId: string, minRole: Role = 'MEMBER') {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { members: { where: { userId } } },
  });
  if (!team) throw ApiError.notFound('Team not found');

  const membership = team.members[0];
  if (!membership) throw ApiError.notFound('Team not found');
  if (!hasRole(membership.role, minRole)) {
    throw ApiError.forbidden('You do not have permission to perform this action');
  }

  return { team, membership, role: membership.role };
}
