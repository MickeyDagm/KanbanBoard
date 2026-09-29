import type { NotificationType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { publicUserSelect } from '../utils/selects.js';
import { emitUserEvent } from '../realtime/socket.js';

const notificationInclude = {
  actor: publicUserSelect,
  card: { select: { id: true, title: true } },
  board: { select: { id: true, title: true } },
  team: { select: { id: true, name: true } },
} as const;

export type NotificationWithRefs = {
  id: string;
  recipientId: string;
  actorId: string;
  type: NotificationType;
  cardId: string | null;
  boardId: string | null;
  teamId: string | null;
  readAt: Date | null;
  createdAt: Date;
  actor: { id: string; email: string; name: string; avatarColor: string };
  card: { id: string; title: string } | null;
  board: { id: string; title: string } | null;
  team: { id: string; name: string } | null;
};

interface NotifyInput {
  recipientId: string;
  actorId: string;
  type: NotificationType;
  cardId?: string;
  boardId?: string;
  teamId?: string;
}

/**
 * Creates a notification and pushes `notification:new` to the recipient's
 * personal user room. Self-notifications are skipped. Best-effort: failures
 * are logged but never break the mutation that triggered them.
 */
export async function notify({ recipientId, actorId, type, cardId, boardId, teamId }: NotifyInput) {
  if (recipientId === actorId) return null;
  try {
    const notification = await prisma.notification.create({
      data: { recipientId, actorId, type, cardId, boardId, teamId },
      include: notificationInclude,
    });
    emitUserEvent(
      recipientId,
      'notification:new',
      { actorId },
      { notification }
    );
    return notification as NotificationWithRefs;
  } catch (err) {
    console.error('Failed to create notification:', err);
    return null;
  }
}

/** Everyone (except `actorId`) who should hear about activity on a card: assignees + card creator. */
export async function cardAudience(cardId: string, actorId: string, excludeIds: string[] = []): Promise<string[]> {
  const [assignees, card] = await Promise.all([
    prisma.cardAssignee.findMany({ where: { cardId }, select: { userId: true } }),
    prisma.card.findUnique({ where: { id: cardId }, select: { createdById: true } }),
  ]);
  const skip = new Set([actorId, ...excludeIds]);
  const ids = assignees.map((a) => a.userId);
  if (card) ids.push(card.createdById);
  return [...new Set(ids)].filter((id) => !skip.has(id));
}

export async function notifyAssigned(input: { actorId: string; assigneeId: string; cardId: string; boardId: string }) {
  return notify({
    recipientId: input.assigneeId,
    actorId: input.actorId,
    type: 'ASSIGNED',
    cardId: input.cardId,
    boardId: input.boardId,
  });
}

export async function notifyMentioned(input: { actorId: string; mentionedIds: string[]; cardId: string; boardId: string }) {
  for (const recipientId of input.mentionedIds) {
    await notify({ recipientId, actorId: input.actorId, type: 'MENTIONED', cardId: input.cardId, boardId: input.boardId });
  }
}

export async function notifyCommented(input: { actorId: string; cardId: string; boardId: string; excludeIds?: string[] }) {
  const audience = await cardAudience(input.cardId, input.actorId, input.excludeIds ?? []);
  for (const recipientId of audience) {
    await notify({ recipientId, actorId: input.actorId, type: 'COMMENTED', cardId: input.cardId, boardId: input.boardId });
  }
}

export async function notifyInviteRedeemed(input: { actorId: string; teamId: string }) {
  const admins = await prisma.teamMember.findMany({
    where: { teamId: input.teamId, role: { in: ['OWNER', 'ADMIN'] } },
    select: { userId: true },
  });
  for (const { userId } of admins) {
    await notify({ recipientId: userId, actorId: input.actorId, type: 'INVITE_REDEEMED', teamId: input.teamId });
  }
}

interface MentionCandidate {
  id: string;
  name: string;
  email: string;
}

/**
 * Finds `@mention` targets in a comment body. Matches team members by email,
 * email local-part, or exact (case-insensitive) name — single token only.
 */
export function parseMentions(body: string, members: MentionCandidate[]): string[] {
  const tokens = body.match(/@[\w.+-]+(?:@[\w.-]+)*/g) ?? [];
  if (!tokens.length) return [];
  const byKey = new Map<string, string>();
  for (const m of members) {
    byKey.set(m.email.toLowerCase(), m.id);
    byKey.set(m.email.split('@')[0]!.toLowerCase(), m.id);
    byKey.set(m.name.toLowerCase(), m.id);
  }
  const ids = new Set<string>();
  for (const raw of tokens) {
    const id = byKey.get(raw.slice(1).toLowerCase());
    if (id) ids.add(id);
  }
  return [...ids];
}

/**
 * `DUE_SOON` sweep: one notification per assignee for cards due within the
 * next 24 hours, deduped so repeated sweeps (interval runs hourly) do not
 * spam. Exported for direct invocation in tests.
 */
export async function sweepDueSoon(now: Date = new Date()): Promise<number> {
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const windowStart = new Date(now.getTime() - 20 * 60 * 60 * 1000);
  const cards = await prisma.card.findMany({
    where: { dueDate: { gt: now, lte: horizon } },
    select: {
      id: true,
      title: true,
      createdById: true,
      list: { select: { boardId: true } },
      assignees: { select: { userId: true } },
    },
  });

  let created = 0;
  for (const card of cards) {
    for (const { userId } of card.assignees) {
      try {
        const recent = await prisma.notification.findFirst({
          where: { recipientId: userId, type: 'DUE_SOON', cardId: card.id, createdAt: { gte: windowStart } },
          select: { id: true },
        });
        if (recent) continue;
        const notification = await prisma.notification.create({
          data: {
            recipientId: userId,
            actorId: card.createdById,
            type: 'DUE_SOON',
            cardId: card.id,
            boardId: card.list.boardId,
          },
          include: notificationInclude,
        });
        emitUserEvent(userId, 'notification:new', { actorId: card.createdById }, { notification });
        created += 1;
      } catch (err) {
        console.error('Failed to create due-soon notification:', err);
      }
    }
  }
  return created;
}
