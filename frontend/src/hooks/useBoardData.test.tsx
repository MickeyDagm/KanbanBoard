import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { boardKey, useBoardMutations } from './useBoardData';
import { cardsApi } from '../lib/api/cardsApi';
import type { BoardDetail, Card, List } from '../types';

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
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const iso = '2026-09-20T10:00:00.000Z';

const makeCard = (id: string, listId: string, position: number, title = id): Card => ({
  id,
  listId,
  title,
  description: '',
  position,
  dueDate: null,
  priority: 'NONE',
  cover: null,
  done: false,
  createdById: 'u1',
  createdAt: iso,
  updatedAt: iso,
  labels: [],
  assignees: [],
  _count: { checklists: 0, comments: 0 },
});

const makeList = (id: string, position: number): List => ({
  id,
  boardId: 'b1',
  title: id.toUpperCase(),
  position,
  createdAt: iso,
  updatedAt: iso,
});

const seedBoard = (): BoardDetail => ({
  board: {
    id: 'b1',
    teamId: 't1',
    title: 'Roadmap',
    description: null,
    background: '#3b82f6',
    createdById: 'u1',
    createdAt: iso,
    updatedAt: iso,
  },
  membership: { role: 'OWNER', teamId: 't1' },
  lists: [makeList('l1', 0), makeList('l2', 1)],
  cards: [makeCard('c1', 'l1', 0), makeCard('c2', 'l1', 1), makeCard('c3', 'l1', 2)],
  labels: [],
  members: [],
});

describe('useBoardMutations', () => {
  let client: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    client.setQueryData(boardKey('b1'), seedBoard());
  });

  it('applyCards mirrors a local drag into the query cache', () => {
    const { result } = renderHook(() => useBoardMutations('b1'), { wrapper });
    const reordered = [
      makeCard('c3', 'l1', 0),
      makeCard('c1', 'l1', 1),
      makeCard('c2', 'l1', 2),
    ];

    act(() => result.current.applyCards(reordered));

    const cached = client.getQueryData<BoardDetail>(boardKey('b1'))!;
    expect(cached.cards.map((c) => c.id)).toEqual(['c3', 'c1', 'c2']);
    expect(cardsApi.move).not.toHaveBeenCalled();
  });

  it('createCard inserts an optimistic temp card and swaps in the server card', async () => {
    let resolveCreate!: (value: { card: Card }) => void;
    vi.mocked(cardsApi.create).mockReturnValue(
      new Promise<{ card: Card }>((resolve) => {
        resolveCreate = resolve;
      })
    );
    const { result } = renderHook(() => useBoardMutations('b1'), { wrapper });

    await act(async () => {
      result.current.createCard.mutate({ listId: 'l1', title: 'New task' });
    });

    const during = client.getQueryData<BoardDetail>(boardKey('b1'))!;
    const temp = during.cards.find((c) => c.title === 'New task');
    expect(temp).toBeDefined();
    expect(temp!.id.startsWith('temp-')).toBe(true);
    expect(cardsApi.create).toHaveBeenCalledWith('l1', 'New task');

    resolveCreate({ card: makeCard('svr1', 'l1', 3, 'New task') });

    await waitFor(() => {
      const after = client.getQueryData<BoardDetail>(boardKey('b1'))!;
      expect(after.cards.some((c) => c.id.startsWith('temp-'))).toBe(false);
      expect(after.cards.some((c) => c.id === 'svr1')).toBe(true);
    });
    expect(toast.success).toHaveBeenCalledWith('Card created successfully');
  });

  it('rolls back the optimistic insert when createCard fails', async () => {
    let rejectCreate!: (error: Error) => void;
    vi.mocked(cardsApi.create).mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectCreate = reject;
      })
    );
    const { result } = renderHook(() => useBoardMutations('b1'), { wrapper });

    await act(async () => {
      result.current.createCard.mutate({ listId: 'l1', title: 'Doomed' });
    });
    expect(
      client.getQueryData<BoardDetail>(boardKey('b1'))!.cards.some((c) => c.title === 'Doomed')
    ).toBe(true);

    await act(async () => {
      rejectCreate(new Error('Network down'));
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Network down'));
    const after = client.getQueryData<BoardDetail>(boardKey('b1'))!;
    expect(after.cards.some((c) => c.title === 'Doomed')).toBe(false);
    expect(after.cards.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('moveCard persists the move to the server', async () => {
    vi.mocked(cardsApi.move).mockResolvedValue({ card: null });
    const { result } = renderHook(() => useBoardMutations('b1'), { wrapper });

    act(() => result.current.moveCard.mutate({ cardId: 'c1', listId: 'l2', index: 0 }));

    await waitFor(() =>
      expect(cardsApi.move).toHaveBeenCalledWith('c1', { listId: 'l2', index: 0 })
    );
    await waitFor(() => expect(toast.error).not.toHaveBeenCalled());
  });
});
