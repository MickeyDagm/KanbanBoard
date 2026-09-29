import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { boardsApi } from '../lib/api/boardsApi';
import { cardsApi, listsApi } from '../lib/api/cardsApi';
import type { BoardDetail, Card, Priority } from '../types';

export const boardKey = (boardId: string | null) => ['board', boardId] as const;

export function useBoardData(boardId: string | null) {
  return useQuery({
    queryKey: boardKey(boardId),
    queryFn: () => boardsApi.get(boardId as string),
    enabled: !!boardId,
  });
}

const tempId = () => `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const nowIso = () => new Date().toISOString();

const errMsg = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export function useBoardMutations(boardId: string | null) {
  const queryClient = useQueryClient();
  const key = boardKey(boardId);

  const mutateCache = (updater: (old: BoardDetail | undefined) => BoardDetail | undefined) => {
    queryClient.setQueryData<BoardDetail>(key, updater);
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  /** Overwrite the card list (used after drag-and-drop settles the local state). */
  const applyCards = (nextCards: Card[]) => {
    mutateCache((old) => (old ? { ...old, cards: nextCards } : old));
  };

  const invalidateWithRollback = (
    error: unknown,
    previous: BoardDetail | undefined,
    fallback: string
  ) => {
    if (previous) queryClient.setQueryData(key, previous);
    toast.error(errMsg(error, fallback));
    void refresh();
  };

  const createList = useMutation({
    mutationFn: (title: string) => {
      if (!boardId) throw new Error('No board selected');
      return listsApi.create(boardId, title);
    },
    onMutate: async (title) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BoardDetail>(key);
      mutateCache((old) =>
        old
          ? {
              ...old,
              lists: [
                ...old.lists,
                {
                  id: tempId(),
                  boardId: old.board.id,
                  title,
                  position: old.lists.length,
                  createdAt: nowIso(),
                  updatedAt: nowIso(),
                },
              ],
            }
          : old
      );
      return { previous };
    },
    onSuccess: ({ list }) => {
      mutateCache((old) =>
        old
          ? { ...old, lists: old.lists.map((l) => (l.id.startsWith('temp-') ? list : l)) }
          : old
      );
      toast.success('List created successfully');
    },
    onError: (error, _title, ctx) =>
      invalidateWithRollback(error, ctx?.previous, 'Failed to create list'),
    onSettled: () => refresh(),
  });

  const updateList = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => listsApi.update(id, { title }),
    onMutate: async ({ id, title }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BoardDetail>(key);
      mutateCache((old) =>
        old ? { ...old, lists: old.lists.map((l) => (l.id === id ? { ...l, title } : l)) } : old
      );
      return { previous };
    },
    onError: (error, _vars, ctx) =>
      invalidateWithRollback(error, ctx?.previous, 'Failed to update list'),
    onSettled: () => refresh(),
  });

  const deleteList = useMutation({
    mutationFn: (id: string) => listsApi.remove(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BoardDetail>(key);
      mutateCache((old) =>
        old
          ? {
              ...old,
              lists: old.lists.filter((l) => l.id !== id),
              cards: old.cards.filter((c) => c.listId !== id),
            }
          : old
      );
      return { previous };
    },
    onSuccess: () => toast.success('List deleted successfully'),
    onError: (error, _id, ctx) => invalidateWithRollback(error, ctx?.previous, 'Failed to delete list'),
    onSettled: () => refresh(),
  });

  const createCard = useMutation({
    mutationFn: ({ listId, title }: { listId: string; title: string }) =>
      cardsApi.create(listId, title),
    onMutate: async ({ listId, title }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BoardDetail>(key);
      mutateCache((old) =>
        old
          ? {
              ...old,
              cards: [
                ...old.cards,
                {
                  ...emptyCard({ id: tempId(), listId, title, createdById: '' }),
                  position: old.cards.filter((c) => c.listId === listId).length,
                },
              ],
            }
          : old
      );
      return { previous };
    },
    onSuccess: ({ card }) => {
      mutateCache((old) =>
        old
          ? { ...old, cards: old.cards.map((c) => (c.id.startsWith('temp-') ? card : c)) }
          : old
      );
      toast.success('Card created successfully');
    },
    onError: (error, _vars, ctx) =>
      invalidateWithRollback(error, ctx?.previous, 'Failed to create card'),
    onSettled: () => refresh(),
  });

  const updateCard = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<Card, 'title' | 'description' | 'dueDate' | 'priority' | 'cover'>>;
    }) => cardsApi.update(id, patch),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BoardDetail>(key);
      mutateCache((old) =>
        old ? { ...old, cards: old.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) } : old
      );
      return { previous };
    },
    onError: (error, _vars, ctx) =>
      invalidateWithRollback(error, ctx?.previous, 'Failed to update card'),
    onSettled: () => refresh(),
  });

  const deleteCard = useMutation({
    mutationFn: (id: string) => cardsApi.remove(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BoardDetail>(key);
      mutateCache((old) => (old ? { ...old, cards: old.cards.filter((c) => c.id !== id) } : old));
      return { previous };
    },
    onSuccess: () => toast.success('Card deleted successfully'),
    onError: (error, _id, ctx) => invalidateWithRollback(error, ctx?.previous, 'Failed to delete card'),
    onSettled: () => refresh(),
  });

  /**
   * Persist a drag-and-drop move. The UI state has already been written into
   * the query cache (applyCards); the server reindexes positions transactionally
   * and the final refresh normalizes everything.
   */
  const moveCard = useMutation({
    mutationFn: ({ cardId, listId, index }: { cardId: string; listId: string; index: number }) =>
      cardsApi.move(cardId, { listId, index }),
    onError: (error) => {
      toast.error(errMsg(error, 'Failed to move card'));
      void refresh();
    },
    onSettled: () => refresh(),
  });

  return {
    applyCards,
    createList,
    updateList,
    deleteList,
    createCard,
    updateCard,
    deleteCard,
    moveCard,
  };
}

function emptyCard(partial: Pick<Card, 'id' | 'listId' | 'title' | 'createdById'>): Card {
  return {
    ...partial,
    description: '',
    position: 0,
    dueDate: null,
    priority: 'NONE' as Priority,
    cover: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    labels: [],
    assignees: [],
  };
}
