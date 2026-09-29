export const publicUserSelect = {
  select: {
    id: true,
    email: true,
    name: true,
    avatarColor: true,
  },
} as const;

export const AVATAR_COLORS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#84cc16',
  '#22c55e',
  '#14b8a6',
  '#0ea5e9',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
] as const;

export function pickAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
