import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cardsApi } from '../lib/api/cardsApi';
import { getSocket } from '../lib/socket';
import { isOwnClientEvent } from '../lib/clientEvents';
import type { CardDetail } from '../types';

export const cardKey = (cardId: string | null) => ['card', cardId] as const;

/**
 * Full card detail (checklists, comments, activity) with realtime refresh.
 * Listens on the board room already joined by BoardPage: `card:updated`
 * patches embedded labels/assignees, `card:detail:changed` refetches, and any
 * label mutation refreshes embedded label data.
 */
export function useCardDetail(cardId: string | null): ReturnType<typeof useQuery<CardDetail>> {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: cardKey(cardId),
    queryFn: () => cardsApi.getDetail(cardId!),
    enabled: !!cardId,
    retry: false,
  });

  useEffect(() => {
    if (!cardId) return;
    const socket = getSocket();
    const key = cardKey(cardId);

    const handle = <T extends { clientEventId?: string }>(
      type: string,
      listener: (data: T) => void
    ): (() => void) => {
      const wrapped = (data: T) => {
        if (isOwnClientEvent(data?.clientEventId)) return;
        listener(data);
      };
      socket.on(type, wrapped);
      return () => socket.off(type, wrapped);
    };

    const detach = [
      handle<{ card: { id: string } & Record<string, unknown>; clientEventId?: string }>(
        'card:updated',
        ({ card }) => {
          if (card.id !== cardId) return;
          queryClient.setQueryData<CardDetail>(key, (old) =>
            old ? { ...old, card: { ...old.card, ...card } } : old
          );
        }
      ),
      handle<{ cardId: string; clientEventId?: string }>('card:detail:changed', ({ cardId: id }) => {
        if (id === cardId) queryClient.invalidateQueries({ queryKey: key });
      }),
      handle<{ cardId: string; clientEventId?: string }>('card:deleted', ({ cardId: id }) => {
        if (id === cardId) queryClient.removeQueries({ queryKey: key });
      }),
      // Label rename/color/delete affects embedded label copies — cheap refetch.
      handle<{ label: { id: string }; clientEventId?: string }>('label:updated', () =>
        queryClient.invalidateQueries({ queryKey: key })
      ),
      handle<{ labelId: string; clientEventId?: string }>('label:deleted', () =>
        queryClient.invalidateQueries({ queryKey: key })
      ),
    ];

    return () => {
      for (const off of detach) off();
    };
  }, [cardId, queryClient]);

  return query;
}
