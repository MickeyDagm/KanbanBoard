import { apiFetch } from '../api';
import type { AppNotification, NotificationListResponse } from '../../types';

export const notificationsApi = {
  list: (unreadOnly = false) =>
    apiFetch<NotificationListResponse>(`/notifications${unreadOnly ? '?unread=1' : ''}`),

  markRead: (id: string) =>
    apiFetch<{ notification: AppNotification }>(`/notifications/${id}/read`, { method: 'POST' }),

  markAllRead: () => apiFetch<{ updated: number }>('/notifications/read-all', { method: 'POST' }),
};
