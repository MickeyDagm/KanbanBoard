import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../lib/socket';
import { notificationsApi } from '../lib/api/notificationsApi';
import type { AppNotification, NotificationListResponse } from '../types';

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** One-line sentence for a notification, based on its type. */
function notificationText(n: AppNotification): string {
  const who = n.actor.name;
  const card = n.card?.title ?? 'a card';
  const team = n.team?.name ?? 'a team';
  switch (n.type) {
    case 'ASSIGNED':
      return `${who} assigned you to “${card}”`;
    case 'COMMENTED':
      return `${who} commented on “${card}”`;
    case 'MENTIONED':
      return `${who} mentioned you in “${card}”`;
    case 'INVITE_REDEEMED':
      return `${who} joined ${team}`;
    case 'DUE_SOON':
      return `“${card}” is due soon`;
    default:
      return `${who} updated “${card}”`;
  }
}

/** Target route for clicking a notification. */
function notificationRoute(n: AppNotification): string | null {
  if (n.boardId) return `/boards/${n.boardId}`;
  if (n.teamId) return `/teams/${n.teamId}`;
  return null;
}

const notificationsKey = ['notifications'];

interface NotificationsBellProps {
  placement?: 'up' | 'down';
}

const NotificationsBell: React.FC<NotificationsBellProps> = ({ placement = 'up' }) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: notificationsKey,
    queryFn: () => notificationsApi.list(),
    staleTime: 15_000,
  });
  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  // Live updates: the server joins every socket to `user:<id>`, so a single
  // listener is enough — no room to join on connect.
  useEffect(() => {
    const socket = getSocket();
    socket.connect();
    const onNew = (payload: { notification?: AppNotification }) => {
      if (!payload.notification) return;
      queryClient.setQueryData<NotificationListResponse>(notificationsKey, (old) =>
        old
          ? {
              notifications: [payload.notification!, ...old.notifications].slice(0, 30),
              unreadCount: old.unreadCount + 1,
            }
          : old
      );
    };
    socket.on('notification:new', onNew);
    return () => {
      socket.off('notification:new', onNew);
    };
  }, [queryClient]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: notificationsKey });

  const handleClick = async (n: AppNotification) => {
    setOpen(false);
    if (!n.readAt) {
      await notificationsApi.markRead(n.id).catch(() => undefined);
      refresh();
    }
    const route = notificationRoute(n);
    if (route) navigate(route);
  };

  const handleMarkAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await notificationsApi.markAllRead().catch(() => undefined);
    refresh();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Notifications"
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
        className="relative p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
      >
        <Bell className="w-[18px] h-[18px]" />
        {unreadCount > 0 && (
          <span
            data-testid="bell-badge"
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500
                     text-white text-[10px] font-bold leading-4 text-center"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          data-testid="notifications-panel"
          className={`absolute ${
            placement === 'down'
              ? 'top-full mt-2 right-0 sm:right-auto sm:left-0'
              : 'bottom-full mb-2 left-0'
          } w-[calc(100vw-2rem)] sm:w-80 max-w-sm max-h-96 overflow-y-auto z-50
          bg-slate-800 border border-slate-700 rounded-lg shadow-xl`}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
            <span className="text-xs font-semibold uppercase text-slate-400">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAll}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="px-3 py-6 text-sm text-slate-500 text-center">You're all caught up</div>
          ) : (
            <ul>
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => handleClick(n)}
                    className={`w-full text-left px-3 py-2.5 flex gap-2.5 items-start hover:bg-slate-700/60 transition-colors ${
                      n.readAt ? 'opacity-60' : ''
                    }`}
                  >
                    <span
                      className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                      style={{ backgroundColor: n.actor.avatarColor }}
                    >
                      {n.actor.name?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm ${n.readAt ? 'text-slate-300' : 'text-white'}`}>
                        {notificationText(n)}
                      </span>
                      <span className="block text-xs text-slate-500 mt-0.5">{timeAgo(n.createdAt)}</span>
                    </span>
                    {!n.readAt && <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationsBell;
