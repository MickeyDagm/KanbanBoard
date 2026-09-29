import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../lib/socket';
import { isOwnClientEvent } from '../lib/clientEvents';
import { boardKey } from './useBoardData';
import type { BoardDetail, Card, Label, List } from '../types';

interface Envelope {
  actorId: string;
  clientEventId?: string;
}

const byPosition = (a: Card, b: Card) => a.position - b.position;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(n, max));

/**
 * Recompute both affected lists exactly like the server's transactional
 * reindex: cards contiguous 0..n in the target list with the moved card
 * spliced at `index`, and the source list closed up. Idempotent — replaying
 * the same event yields the same state.
 */
function applyCardMoved(
  detail: BoardDetail,
  payload: { card: Card; fromListId: string; toListId: string; index: number }
): BoardDetail {
  const moving: Card = { ...payload.card, listId: payload.toListId };
  const others = detail.cards.filter((c) => c.id !== moving.id);

  const buildList = (listId: string, insertAt?: number): Card[] => {
    const arr = others.filter((c) => c.listId === listId).sort(byPosition);
    if (insertAt !== undefined) arr.splice(clamp(insertAt, 0, arr.length), 0, moving);
    return arr.map((c, i) => ({ ...c, position: i }));
  };

  let source: Card[] = [];
  let target: Card[];
  if (payload.fromListId === payload.toListId) {
    target = buildList(payload.toListId, payload.index);
  } else {
    source = buildList(payload.fromListId);
    target = buildList(payload.toListId, payload.index);
  }
  const rest = others.filter((c) => c.listId !== payload.fromListId && c.listId !== payload.toListId);

  return { ...detail, cards: [...rest, ...source, ...target] };
}

/**
 * Board-scoped realtime: joins `board:{id}` for the board currently on screen
 * and mirrors list/card events into its React Query cache. Events originating
 * from this tab (matched via client event id) are ignored — the optimistic
 * update already applied them. Team-level events live in useTeamRealtime.
 */
export function useBoardRealtime(boardId: string | null): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!boardId) return;
    const socket = getSocket();
    socket.connect();

    const key = boardKey(boardId);
    const patchBoard = (fn: (old: BoardDetail | undefined) => BoardDetail | undefined) =>
      queryClient.setQueryData<BoardDetail>(key, fn);

    const handle = <T extends Envelope>(type: string, listener: (data: T) => void): (() => void) => {
      const wrapped = (data: T) => {
        if (isOwnClientEvent(data?.clientEventId)) return;
        listener(data);
      };
      socket.on(type, wrapped);
      return () => socket.off(type, wrapped);
    };

    const detach: (() => void)[] = [
      handle<{ list: List } & Envelope>('list:created', ({ list }) =>
        patchBoard((old) =>
          old
            ? old.lists.some((l) => l.id === list.id)
              ? old
              : { ...old, lists: [...old.lists, list].sort((a, b) => a.position - b.position) }
            : old
        )
      ),
      handle<{ list: List } & Envelope>('list:updated', ({ list }) =>
        patchBoard((old) =>
          old
            ? { ...old, lists: old.lists.map((l) => (l.id === list.id ? { ...l, ...list } : l)) }
            : old
        )
      ),
      handle<{ listId: string } & Envelope>('list:deleted', ({ listId }) =>
        patchBoard((old) =>
          old
            ? {
                ...old,
                lists: old.lists.filter((l) => l.id !== listId),
                cards: old.cards.filter((c) => c.listId !== listId),
              }
            : old
        )
      ),
      handle<{ card: Card } & Envelope>('card:created', ({ card }) =>
        patchBoard((old) =>
          old
            ? {
                ...old,
                cards: old.cards.some((c) => c.id === card.id)
                  ? old.cards.map((c) => (c.id === card.id ? card : c))
                  : [...old.cards, card],
              }
            : old
        )
      ),
      handle<{ card: Card } & Envelope>('card:updated', ({ card }) =>
        patchBoard((old) =>
          old
            ? {
                ...old,
                cards: old.cards.some((c) => c.id === card.id)
                  ? old.cards.map((c) => (c.id === card.id ? { ...c, ...card } : c))
                  : old.cards,
              }
            : old
        )
      ),
      handle<{ cardId: string } & Envelope>('card:deleted', ({ cardId }) =>
        patchBoard((old) => (old ? { ...old, cards: old.cards.filter((c) => c.id !== cardId) } : old))
      ),
      handle<{ card: Card; fromListId: string; toListId: string; index: number } & Envelope>(
        'card:moved',
        (payload) => patchBoard((old) => (old ? applyCardMoved(old, payload) : old))
      ),
      handle<{ label: Label } & Envelope>('label:created', ({ label }) =>
        patchBoard((old) =>
          old && !old.labels.some((l) => l.id === label.id)
            ? { ...old, labels: [...old.labels, label] }
            : old
        )
      ),
      handle<{ label: Label } & Envelope>('label:updated', ({ label }) =>
        patchBoard((old) =>
          old
            ? {
                ...old,
                labels: old.labels.map((l) => (l.id === label.id ? label : l)),
                cards: old.cards.map((c) =>
                  c.labels.some((l) => l.id === label.id)
                    ? { ...c, labels: c.labels.map((l) => (l.id === label.id ? label : l)) }
                    : c
                ),
              }
            : old
        )
      ),
      handle<{ labelId: string } & Envelope>('label:deleted', ({ labelId }) =>
        patchBoard((old) =>
          old
            ? {
                ...old,
                labels: old.labels.filter((l) => l.id !== labelId),
                cards: old.cards.map((c) =>
                  c.labels.some((l) => l.id === labelId)
                    ? { ...c, labels: c.labels.filter((l) => l.id !== labelId) }
                    : c
                ),
              }
            : old
        )
      ),
    ];

    const joinRoom = () => socket.emit('board:join', boardId);
    socket.on('connect', joinRoom);
    if (socket.connected) joinRoom();

    return () => {
      socket.off('connect', joinRoom);
      for (const off of detach) off();
      // Only leave when actually connected: a leave emitted mid-handshake is
      // buffered by socket.io and flushed on connect — racing (and potentially
      // undoing) the join of a later mount (StrictMode double-effect).
      if (socket.connected) socket.emit('board:leave', boardId);
    };
  }, [boardId, queryClient]);
}
