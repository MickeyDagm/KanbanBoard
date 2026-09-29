import { apiFetch } from '../api';
import type {
  Card,
  CardDetail,
  Checklist,
  ChecklistItem,
  Comment,
  Label,
  List,
  Priority,
} from '../../types';

export const listsApi = {
  create: (boardId: string, title: string) =>
    apiFetch<{ list: List }>(`/boards/${boardId}/lists`, { method: 'POST', body: { title } }),

  update: (id: string, body: { title: string }) =>
    apiFetch<{ list: List }>(`/lists/${id}`, { method: 'PATCH', body }),

  remove: (id: string) => apiFetch<void>(`/lists/${id}`, { method: 'DELETE' }),
};

export const cardsApi = {
  create: (listId: string, title: string) =>
    apiFetch<{ card: Card }>(`/lists/${listId}/cards`, { method: 'POST', body: { title } }),

  getDetail: (id: string) => apiFetch<CardDetail>(`/cards/${id}`),

  update: (
    id: string,
    body: {
      title?: string;
      description?: string;
      dueDate?: string | null;
      priority?: Priority;
      cover?: string | null;
      done?: boolean;
    }
  ) => apiFetch<{ card: Card }>(`/cards/${id}`, { method: 'PATCH', body }),

  remove: (id: string) => apiFetch<void>(`/cards/${id}`, { method: 'DELETE' }),

  move: (id: string, body: { listId?: string; index: number }) =>
    apiFetch<{ card: Card | null }>(`/cards/${id}/move`, { method: 'POST', body }),

  // ── labels on cards ──
  attachLabel: (id: string, labelId: string) =>
    apiFetch<{ card: Card }>(`/cards/${id}/labels`, { method: 'POST', body: { labelId } }),

  detachLabel: (id: string, labelId: string) =>
    apiFetch<void>(`/cards/${id}/labels/${labelId}`, { method: 'DELETE' }),

  // ── assignees ──
  assign: (id: string, userId: string) =>
    apiFetch<{ card: Card }>(`/cards/${id}/assignees`, { method: 'POST', body: { userId } }),

  unassign: (id: string, userId: string) =>
    apiFetch<void>(`/cards/${id}/assignees/${userId}`, { method: 'DELETE' }),

  // ── checklists ──
  createChecklist: (id: string, title: string) =>
    apiFetch<{ checklist: Checklist }>(`/cards/${id}/checklists`, { method: 'POST', body: { title } }),

  updateChecklist: (id: string, body: { title?: string }) =>
    apiFetch<{ checklist: Checklist }>(`/checklists/${id}`, { method: 'PATCH', body }),

  removeChecklist: (id: string) => apiFetch<void>(`/checklists/${id}`, { method: 'DELETE' }),

  createItem: (checklistId: string, text: string) =>
    apiFetch<{ item: ChecklistItem }>(`/checklists/${checklistId}/items`, {
      method: 'POST',
      body: { text },
    }),

  updateItem: (id: string, body: { text?: string; done?: boolean }) =>
    apiFetch<{ item: ChecklistItem }>(`/checklist-items/${id}`, { method: 'PATCH', body }),

  removeItem: (id: string) => apiFetch<void>(`/checklist-items/${id}`, { method: 'DELETE' }),

  // ── comments ──
  listComments: (id: string) => apiFetch<{ comments: Comment[] }>(`/cards/${id}/comments`),

  addComment: (id: string, body: string) =>
    apiFetch<{ comment: Comment }>(`/cards/${id}/comments`, { method: 'POST', body: { body } }),

  updateComment: (id: string, body: string) =>
    apiFetch<{ comment: Comment }>(`/comments/${id}`, { method: 'PATCH', body: { body } }),

  removeComment: (id: string) => apiFetch<void>(`/comments/${id}`, { method: 'DELETE' }),
};

export const labelsApi = {
  create: (boardId: string, body: { name: string; color?: string }) =>
    apiFetch<{ label: Label }>(`/boards/${boardId}/labels`, { method: 'POST', body }),

  update: (id: string, body: { name?: string; color?: string }) =>
    apiFetch<{ label: Label }>(`/labels/${id}`, { method: 'PATCH', body }),

  remove: (id: string) => apiFetch<void>(`/labels/${id}`, { method: 'DELETE' }),
};
