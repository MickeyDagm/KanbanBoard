import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { getSocket } from '../lib/socket';
import { isOwnClientEvent } from '../lib/clientEvents';
import { teamsApi } from '../lib/api/teamsApi';
import { boardKey } from './useBoardData';
import type { Board, BoardDetail, Team } from '../types';

interface Envelope {
  actorId: string;
  clientEventId?: string;
}

/**
 * Team-scoped realtime: joins one room per team the user belongs to and keeps
 * the `['teams']` / `['boards']` caches fresh (sidebar, board grids, team
 * pages). Mounted once in AppShell. Rooms are re-joined on every reconnect.
 */
export function useTeamRealtime(): void {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const teamsQuery = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsApi.list(),
    enabled: !!user,
  });
  const teamIdsKey = (teamsQuery.data?.teams ?? []).map((t) => t.id).join(',');

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    socket.connect();

    const handle = <T extends Envelope>(type: string, listener: (data: T) => void): (() => void) => {
      const wrapped = (data: T) => {
        if (isOwnClientEvent(data?.clientEventId)) return;
        listener(data);
      };
      socket.on(type, wrapped);
      return () => socket.off(type, wrapped);
    };

    const invalidateTeam = (teamId: string) => {
      queryClient.invalidateQueries({ queryKey: ['team', teamId] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    };

    const detach: (() => void)[] = [
      // Team rename
      handle<{ team: { id: string; name: string } } & Envelope>('team:updated', ({ team }) => {
        queryClient.setQueryData<{ teams: Team[] }>(['teams'], (old) =>
          old
            ? { teams: old.teams.map((t) => (t.id === team.id ? { ...t, name: team.name } : t)) }
            : old
        );
        queryClient.invalidateQueries({ queryKey: ['team', team.id] });
      }),

      // Team deleted elsewhere → purge sidebar, grids and the team page
      handle<{ teamId: string } & Envelope>('team:deleted', ({ teamId }) => {
        queryClient.setQueryData<{ teams: Team[] }>(['teams'], (old) =>
          old ? { teams: old.teams.filter((t) => t.id !== teamId) } : old
        );
        queryClient.setQueryData<{ boards: Board[] }>(['boards'], (old) =>
          old ? { boards: old.boards.filter((b) => b.teamId !== teamId) } : old
        );
        queryClient.removeQueries({ queryKey: ['team', teamId] });
      }),

      // Membership changes → refresh the team page + member counts
      handle<{ teamId: string } & Envelope>('member:joined', ({ teamId }) => invalidateTeam(teamId)),
      handle<{ teamId: string } & Envelope>('member:removed', ({ teamId }) => invalidateTeam(teamId)),
      handle<{ teamId: string } & Envelope>('member:role_changed', ({ teamId }) =>
        invalidateTeam(teamId)
      ),

      // Board tab list (created/updated/deleted broadcast to the team room)
      handle<{ board: Board } & Envelope>('board:created', ({ board }) =>
        queryClient.setQueryData<{ boards: Board[] }>(['boards'], (old) =>
          old && old.boards.some((b) => b.id === board.id)
            ? old
            : { boards: [board, ...(old?.boards ?? [])] }
        )
      ),
      handle<{ board: Board } & Envelope>('board:updated', ({ board }) => {
        queryClient.setQueryData<{ boards: Board[] }>(['boards'], (old) =>
          old ? { boards: old.boards.map((b) => (b.id === board.id ? { ...b, ...board } : b)) } : old
        );
        queryClient.setQueryData<BoardDetail>(boardKey(board.id), (old) =>
          old ? { ...old, board: { ...old.board, ...board } } : old
        );
      }),
      handle<{ boardId: string } & Envelope>('board:deleted', ({ boardId: deletedId }) => {
        queryClient.setQueryData<{ boards: Board[] }>(['boards'], (old) =>
          old ? { boards: old.boards.filter((b) => b.id !== deletedId) } : old
        );
        queryClient.removeQueries({ queryKey: boardKey(deletedId) });
      }),
    ];

    const joinRooms = () => {
      for (const teamId of teamIdsKey ? teamIdsKey.split(',') : []) {
        socket.emit('team:join', teamId);
      }
    };
    socket.on('connect', joinRooms);
    if (socket.connected) joinRooms();

    return () => {
      socket.off('connect', joinRooms);
      for (const off of detach) off();
    };
  }, [user, teamIdsKey, queryClient]);
}
