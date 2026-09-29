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
    title: 'Fix login bug',
    description: 'Detailed description here',
    position: 0,
    dueDate: null,
    priority: 'HIGH',
    cover: null,
    done: false,
    createdById: 'u1',
    createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt: '2026-09-20T10:00:00.000Z',
    labels: [],
    assignees: [],
    _count: { checklists: 0, comments: 1 },
    checklists: [],
    comments: [
      {
        id: 'cm1',
        cardId: 'c1',
        authorId: 'u1',
        body: 'Initial comment on this task',
        createdAt: '2026-09-21T10:00:00.000Z',
        updatedAt: '2026-09-21T10:00:00.000Z',
        author: {
          id: 'u1',
          name: 'Ada',
          avatarColor: '#3b82f6',
        },
      },
    ],
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

describe('TaskDetailModal', () => {
  it('renders card title, description, and existing comments and last updated', async () => {
    renderModal();

    expect(await screen.findByDisplayValue('Fix login bug')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Detailed description here')).toBeInTheDocument();
    expect(screen.getByText('Initial comment on this task')).toBeInTheDocument();
    expect(screen.getByText(/Updated/)).toBeInTheDocument();
  });

  it('marks card as completed', async () => {
    vi.mocked(cardsApi.update).mockResolvedValue({
      card: { ...detail.card, done: true },
    } as never);
    renderModal();
    const user = userEvent.setup();

    await screen.findByDisplayValue('Fix login bug');
    const doneBtn = screen.getByRole('button', { name: 'Mark as done' });
    await user.click(doneBtn);

    await waitFor(() =>
      expect(cardsApi.update).toHaveBeenCalledWith('c1', { done: true })
    );
  });

  it('posts a new comment via cardsApi.addComment', async () => {
    vi.mocked(cardsApi.addComment).mockResolvedValue({
      comment: {
        id: 'cm2',
        cardId: 'c1',
        authorId: 'u1',
        body: 'New follow-up comment',
        createdAt: '2026-09-22T10:00:00.000Z',
        updatedAt: '2026-09-22T10:00:00.000Z',
        author: {
          id: 'u1',
          name: 'Ada',
          avatarColor: '#3b82f6',
        },
      },
    } as never);
    renderModal();
    const user = userEvent.setup();

    await screen.findByDisplayValue('Fix login bug');
    const input = screen.getByPlaceholderText('Write a comment… (Ctrl+Enter to post)');
    await user.type(input, 'New follow-up comment');
    await user.click(screen.getByRole('button', { name: 'Comment' }));

    await waitFor(() =>
      expect(cardsApi.addComment).toHaveBeenCalledWith('c1', 'New follow-up comment')
    );
    expect(input).toHaveValue('');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows a toast when posting a comment fails', async () => {
    vi.mocked(cardsApi.addComment).mockRejectedValue(new Error('Failed to post comment'));
    renderModal();
    const user = userEvent.setup();

    await screen.findByDisplayValue('Fix login bug');
    const input = screen.getByPlaceholderText('Write a comment… (Ctrl+Enter to post)');
    await user.type(input, 'Another comment');
    await user.click(screen.getByRole('button', { name: 'Comment' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to post comment')
    );
  });
});
