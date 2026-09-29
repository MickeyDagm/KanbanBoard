// ─── Auth ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
  createdAt: string;
}

// ─── Teams ───────────────────────────────────────────────────────────────────

export type Role = 'OWNER' | 'ADMIN' | 'MEMBER';

export const ROLE_RANK: Record<Role, number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };

export function hasRole(role: Role | undefined | null, minRole: Role): boolean {
  return !!role && ROLE_RANK[role] >= ROLE_RANK[minRole];
}

export interface Team {
  id: string;
  name: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  role?: Role;
  memberCount?: number;
}

export interface TeamMember {
  teamId: string;
  userId: string;
  role: Role;
  joinedAt: string;
  user: User;
}

export interface TeamDetail {
  team: Omit<Team, 'role' | 'memberCount'>;
  members: TeamMember[];
  role: Role;
  memberCount: number;
}

export type InviteStatus = 'active' | 'revoked' | 'expired' | 'maxed';

export interface Invite {
  id: string;
  code: string;
  teamId: string;
  role: Role;
  createdById: string;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  status: InviteStatus;
}

export interface InvitePreview {
  team: { id: string; name: string };
  role: Role;
  inviter: Pick<User, 'id' | 'name' | 'email' | 'avatarColor'>;
  status: InviteStatus;
  alreadyMember: boolean;
}

// ─── Boards ──────────────────────────────────────────────────────────────────

export interface Board {
  id: string;
  teamId: string;
  title: string;
  description: string | null;
  background: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  role?: Role;
}

export interface BoardMembership {
  role: Role;
  teamId: string;
}

export interface BoardMember extends User {
  role: Role;
}

export interface BoardDetail {
  board: Board;
  membership: BoardMembership;
  lists: List[];
  cards: Card[];
  labels: Label[];
  members: BoardMember[];
}

// ─── Lists & cards ───────────────────────────────────────────────────────────

export interface List {
  id: string;
  boardId: string;
  title: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export type Priority = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface Label {
  id: string;
  boardId: string;
  name: string;
  color: string;
}

export interface Card {
  id: string;
  listId: string;
  title: string;
  description: string;
  position: number;
  dueDate: string | null;
  priority: Priority;
  cover: string | null;
  done: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  labels: Label[];
  assignees: User[];
  _count?: { checklists: number; comments: number };
}

export interface ChecklistItem {
  id: string;
  checklistId: string;
  text: string;
  done: boolean;
  position: number;
}

export interface Checklist {
  id: string;
  cardId: string;
  title: string;
  position: number;
  items: ChecklistItem[];
}

export interface Comment {
  id: string;
  cardId: string;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: User;
}

export interface ActivityItem {
  id: string;
  actorId: string;
  boardId: string;
  cardId: string | null;
  type: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: User;
}

/** GET /cards/:id payload — board card plus detail-only data. */
export interface CardDetail {
  card: Card & { checklists: Checklist[]; comments: Comment[] };
  activity: ActivityItem[];
}

// ─────────────── notifications (Phase 7) ───────────────

export type NotificationKind =
  | 'ASSIGNED'
  | 'COMMENTED'
  | 'MENTIONED'
  | 'INVITE_REDEEMED'
  | 'DUE_SOON';

export interface AppNotification {
  id: string;
  recipientId: string;
  actorId: string;
  type: NotificationKind;
  cardId: string | null;
  boardId: string | null;
  teamId: string | null;
  readAt: string | null;
  createdAt: string;
  actor: User;
  card: { id: string; title: string } | null;
  board: { id: string; title: string } | null;
  team: { id: string; name: string } | null;
}

export interface NotificationListResponse {
  notifications: AppNotification[];
  unreadCount: number;
}
