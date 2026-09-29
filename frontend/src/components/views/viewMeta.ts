import type { Card, Priority } from '../../types';

export type SortKey = 'title' | 'assignee' | 'priority' | 'due' | 'list';
export type SortDir = 'asc' | 'desc';

export const PRIORITY_RANK: Record<Priority, number> = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  URGENT: 4,
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  NONE: 'None',
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const PRIORITY_BADGE: Record<Priority, string> = {
  NONE: 'bg-slate-100 text-slate-600',
  LOW: 'bg-sky-100 text-sky-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
};

export const PRIORITY_DOT: Record<Priority, string> = {
  NONE: '#94a3b8',
  LOW: '#0ea5e9',
  MEDIUM: '#f59e0b',
  HIGH: '#f97316',
  URGENT: '#ef4444',
};

export function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dueDayKey(card: Card): string | null {
  return card.dueDate ? dayKey(new Date(card.dueDate)) : null;
}

export function isOverdue(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getTime() < now.getTime() && dayKey(d) !== dayKey(now);
}

export function dueIsoForDay(existing: string | null, day: Date): string {
  const d = new Date(day);
  if (existing) {
    const t = new Date(existing);
    d.setHours(t.getHours(), t.getMinutes(), t.getSeconds(), t.getMilliseconds());
  } else {
    d.setHours(12, 0, 0, 0);
  }
  return d.toISOString();
}

export function guardOpen(onOpenCard: (id: string) => void): (id: string) => void {
  return (id: string) => {
    if (id.startsWith('temp-')) return;
    onOpenCard(id);
  };
}

const firstAssignee = (card: Card) => card.assignees[0]?.name ?? '';

export function compareBy(
  key: SortKey,
  dir: SortDir,
  listTitle: (listId: string) => string
): (a: Card, b: Card) => number {
  const sign = dir === 'asc' ? 1 : -1;
  return (a, b) => {
    let r = 0;
    switch (key) {
      case 'title':
        r = a.title.localeCompare(b.title);
        break;
      case 'assignee':
        r = firstAssignee(a).localeCompare(firstAssignee(b));
        break;
      case 'priority':
        r = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        break;
      case 'due': {
        const av = a.dueDate ? new Date(a.dueDate).getTime() : null;
        const bv = b.dueDate ? new Date(b.dueDate).getTime() : null;
        if (av === null && bv === null) r = 0;
        else if (av === null) return 1;
        else if (bv === null) return -1;
        else r = av - bv;
        break;
      }
      case 'list':
        r = listTitle(a.listId).localeCompare(listTitle(b.listId)) || a.position - b.position;
        break;
    }
    if (r === 0) r = a.title.localeCompare(b.title);
    return r * sign;
  };
}
