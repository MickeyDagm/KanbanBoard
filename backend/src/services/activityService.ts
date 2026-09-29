import type { ActivityType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

interface LogActivityInput {
  actorId: string;
  boardId: string;
  cardId?: string;
  type: ActivityType;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Records an activity row. Failures are logged but never break the mutation
 * that triggered them (activity feed is best-effort).
 */
export async function logActivity({ actorId, boardId, cardId, type, metadata }: LogActivityInput) {
  try {
    await prisma.activity.create({
      data: { actorId, boardId, cardId, type, metadata },
    });
  } catch (err) {
    console.error('Failed to write activity log:', err);
  }
}
