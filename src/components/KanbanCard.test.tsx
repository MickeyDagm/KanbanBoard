import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DndContext } from '@dnd-kit/core';
import { format } from 'date-fns';
import KanbanCard from './KanbanCard';
import type { Card, User } from '../types';

const alice: User = {
  id: 'u2',
  email: 'alice@example.com',
  name: 'Alice Wonder',
  avatarColor: '#ef4444',
  createdAt: '2026-09-01T10:00:00.000Z',
};

const baseCard = (over: Partial<Card> = {}): Card => ({
  id: 'c1',
  listId: 'l1',
  title: 'Fix login bug',
  description: '',
  position: 0,
  dueDate: null,
  priority: 'NONE',
  cover: null,
  createdById: 'u1',
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
  labels: [],
  assignees: [],
  _count: { checklists: 0, comments: 0 },
  ...over,
});

const renderCard = (card: Card, onOpen = vi.fn()) => {
  render(
    <DndContext>
      <KanbanCard card={card} onOpen={onOpen} />
    </DndContext>
  );
  return onOpen;
};

describe('KanbanCard', () => {
  it('renders title, priority badge, labels, due date, comment count and assignees', async () => {
    const due = new Date(Date.now() + 2 * 86_400_000);
    renderCard(
      baseCard({
        priority: 'URGENT',
        dueDate: due.toISOString(),
        labels: [{ id: 'lab1', boardId: 'b1', name: 'frontend', color: '#3b82f6' }],
        assignees: [alice],
        _count: { checklists: 1, comments: 3 },
      })
    );

    expect(screen.getByText('Fix login bug')).toBeInTheDocument();
    expect(screen.getByText('Urgent')).toBeInTheDocument();
    expect(screen.getByText('frontend')).toBeInTheDocument();
    expect(screen.getByText(format(due, 'MMM d'))).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByTitle('Alice Wonder')).toBeInTheDocument();
  });

  it('marks an overdue due date with red styling', () => {
    const past = new Date(Date.now() - 3_600_000);
    renderCard(baseCard({ dueDate: past.toISOString() }));

    const dueEl = screen.getByText(format(past, 'MMM d'));
    expect(dueEl.className).toContain('text-red-600');
  });

  it('hides meta badges for a NONE-priority card with no due date or comments', () => {
    renderCard(baseCard());

    expect(screen.getByText('Fix login bug')).toBeInTheDocument();
    expect(screen.queryByText('Urgent')).not.toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('opens the card on click', async () => {
    const onOpen = renderCard(baseCard());

    await userEvent.click(screen.getByText('Fix login bug'));

    expect(onOpen).toHaveBeenCalledWith('c1');
  });

  it('never opens an optimistic temp card', async () => {
    const onOpen = renderCard(baseCard({ id: 'temp-123-abc' }));

    await userEvent.click(screen.getByText('Fix login bug'));

    expect(onOpen).not.toHaveBeenCalled();
  });
});
