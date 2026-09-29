import { apiFetch } from '../api';
import type { Board, BoardDetail } from '../../types';

export const boardsApi = {
  list: (teamId?: string) =>
    apiFetch<{ boards: Board[] }>(teamId ? `/boards?teamId=${teamId}` : '/boards'),

  get: (id: string) => apiFetch<BoardDetail>(`/boards/${id}`),

  create: (body: { teamId: string; title: string; description?: string | null }) =>
    apiFetch<{ board: Board }>('/boards', { method: 'POST', body }),

  update: (id: string, body: { title?: string; description?: string | null; background?: string }) =>
    apiFetch<{ board: Board }>(`/boards/${id}`, { method: 'PATCH', body }),

  remove: (id: string) => apiFetch<void>(`/boards/${id}`, { method: 'DELETE' }),
};
