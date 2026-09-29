import { publicUserSelect } from './selects.js';

export const cardInclude = {
  labels: { include: { label: true } },
  assignees: { include: { user: publicUserSelect } },
  _count: { select: { checklists: true, comments: true } },
} as const;

export function serializeCard<T extends { labels: { label: unknown }[]; assignees: { user: unknown }[] }>(
  card: T
) {
  return {
    ...card,
    labels: card.labels.map((cl) => cl.label),
    assignees: card.assignees.map((a) => a.user),
  };
}
