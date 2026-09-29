import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import TaskDetailModal from './TaskDetailModal';
import { AuthProvider } from '../contexts/AuthContext';
import { authApi } from '../lib/api/authApi';
import { cardsApi } from '../lib/api/cardsApi';
import type { CardDetail, User } from '../types';

vi.mock('../lib/api/cardsApi', () => ({
  cardsApi: {
    create: vi.fn(),
    getDetail: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    move: vi.fn(),
    attachLabel: vi.fn(),
    detachLabel: vi.fn(),
    assign: vi.fn(),
    unassign: vi.fn(),
    createChecklist: vi.fn(),
    updateChecklist: vi.fn(),
    removeChecklist: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
    listComments: vi.fn(),
    addComment: vi.fn(),
    updateComment: vi.fn(),
    removeComment: vi.fn(),
  },
  listsApi: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));
vi.mock('../lib/api/boardsApi', () => ({ boardsApi: { get: vi.fn() } }));
vi.mock('../lib/api/authApi', () => ({
  authApi: { me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() },
}));
vi.mock('../lib/socket', () => {
  const socket = { on: vi.fn(() => () => {}), off: vi.fn() };
  return { getSocket: vi.fn(() => socket), connectSocket: vi.fn(), disconnectSocket: vi.fn() };
});
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const currentUser: User = {
  id: 'u1',
  email: 'ada@example.com',
  name: 'Ada',
  avatarColor: '#3b82f6',
  createdAt: '2026-09-01T10:00:00.000Z',
};

const detail: CardDetail = {
  card: {
    id: 'c1',
    listId: 'l1',
    title: 'Launch checklist',
    description: '',
    position: 0,
    dueDate: null,
    priority: 'HIGH',
    cover: null,
    createdById: 'u1',
    createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt: '2026-09-20T10:00:00.000Z',
    labels: [],
    assignees: [],
    _count: { checklists: 1, comments: 0 },
    checklists: [
      {
        id: 'cl1',
        cardId: 'c1',
        title: 'Steps',
        position: 0,
        items: [
          { id: 'i1', checklistId: 'cl1', text: 'Write tests', done: false, position: 0 },
          { id: 'i2', checklistId: 'cl1', text: 'Ship it', done: true, position: 1 },
        ],
      },
    ],
    comments: [],
  },
  activity: [],
};

const renderModal = (onClose = vi.fn()) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <TaskDetailModal
          cardId="c1"
          boardId="b1"
          members={[]}
          boardLabels={[]}
          myRole="OWNER"
          onClose={onClose}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
  return onClose;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authApi.me).mockResolvedValue({ user: currentUser } as never);
  vi.mocked(cardsApi.getDetail).mockResolvedValue(detail);
});

describe('TaskDetailModal checklists', () => {
  it('renders checklist items with progress', async () => {
    renderModal();

    expect(await screen.findByText('Write tests')).toBeInTheDocument();
    expect(screen.getByText('Ship it')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByLabelText('Mark done')).toBeInTheDocument();
    expect(screen.getByLabelText('Mark not done')).toBeInTheDocument();
  });

  it('toggles a checklist item done via cardsApi.updateItem', async () => {
    vi.mocked(cardsApi.updateItem).mockResolvedValue({
      item: { ...detail.card.checklists[0].items[0], done: true },
    } as never);
    renderModal();
    const user = userEvent.setup();

    await screen.findByText('Write tests');
    await user.click(screen.getByRole('button', { name: 'Mark done' }));

    await waitFor(() => expect(cardsApi.updateItem).toHaveBeenCalledWith('i1', { done: true }));
    expect(await screen.findAllByRole('button', { name: 'Mark not done' })).toHaveLength(2);
    expect(screen.getByText('2/2')).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows a toast and keeps the item when the toggle request fails', async () => {
    vi.mocked(cardsApi.updateItem).mockRejectedValue(new Error('Server exploded'));
    renderModal();
    const user = userEvent.setup();

    await screen.findByText('Write tests');
    await user.click(screen.getByRole('button', { name: 'Mark done' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Server exploded'));
    expect(screen.getByRole('button', { name: 'Mark done' })).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });
});
