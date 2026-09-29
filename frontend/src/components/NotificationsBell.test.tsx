import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NotificationsBell from './NotificationsBell';
import { notificationsApi } from '../lib/api/notificationsApi';
import type { AppNotification } from '../types';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../lib/api/notificationsApi', () => ({
  notificationsApi: {
    list: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}));

vi.mock('../lib/socket', () => {
  const socket = { on: vi.fn(() => () => {}), off: vi.fn(), connect: vi.fn() };
  return { getSocket: vi.fn(() => socket), connectSocket: vi.fn(), disconnectSocket: vi.fn() };
});

const mockNotifications: AppNotification[] = [
  {
    id: 'n1',
    userId: 'u1',
    actorId: 'u2',
    actor: { id: 'u2', name: 'Bob Smith', avatarColor: '#10b981' },
    type: 'ASSIGNED',
    boardId: 'b1',
    cardId: 'c1',
    card: { id: 'c1', title: 'Setup database schema' },
    readAt: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'n2',
    userId: 'u1',
    actorId: 'u3',
    actor: { id: 'u3', name: 'Carol White', avatarColor: '#ec4899' },
    type: 'COMMENTED',
    boardId: 'b1',
    cardId: 'c2',
    card: { id: 'c2', title: 'Review pull request' },
    readAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
];

const renderNotificationsBell = (props: React.ComponentProps<typeof NotificationsBell> = {}) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <NotificationsBell {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(notificationsApi.list).mockResolvedValue({
    notifications: mockNotifications,
    unreadCount: 1,
  });
  vi.mocked(notificationsApi.markRead).mockResolvedValue({
    notification: { ...mockNotifications[0], readAt: new Date().toISOString() },
  });
  vi.mocked(notificationsApi.markAllRead).mockResolvedValue({ updated: 1 });
});

describe('NotificationsBell responsiveness and interactions', () => {
  it('renders unread badge and opens panel on click', async () => {
    const user = userEvent.setup();
    renderNotificationsBell();

    const bellButton = await screen.findByRole('button', { name: /notifications/i });
    expect(bellButton).toBeInTheDocument();

    const badge = await screen.findByTestId('bell-badge');
    expect(badge).toHaveTextContent('1');

    await user.click(bellButton);

    const panel = await screen.findByTestId('notifications-panel');
    expect(panel).toBeInTheDocument();
    expect(screen.getByText('Setup database schema', { exact: false })).toBeInTheDocument();
  });

  it('applies viewport-responsive fixed/absolute classes for mobile header (placement="down")', async () => {
    const user = userEvent.setup();
    renderNotificationsBell({ placement: 'down' });

    const bellButton = await screen.findByRole('button', { name: /notifications/i });
    await user.click(bellButton);

    const panel = await screen.findByTestId('notifications-panel');
    expect(panel.className).toContain('fixed');
    expect(panel.className).toContain('inset-x-3');
    expect(panel.className).toContain('sm:inset-x-auto');
    expect(panel.className).toContain('sm:right-4');
  });

  it('applies drawer-responsive inset-x-2 classes for sidebar / drawer (placement="up")', async () => {
    const user = userEvent.setup();
    renderNotificationsBell({ placement: 'up' });

    const bellButton = await screen.findByRole('button', { name: /notifications/i });
    await user.click(bellButton);

    const panel = await screen.findByTestId('notifications-panel');
    expect(panel.className).toContain('bottom-full');
    expect(panel.className).toContain('inset-x-2');
    expect(panel.className).toContain('md:inset-x-auto');
    expect(panel.className).toContain('md:left-2');
    expect(panel.className).toContain('md:w-80');
  });

  it('calls onItemClick and navigates when a notification is clicked', async () => {
    const user = userEvent.setup();
    const onItemClick = vi.fn();
    renderNotificationsBell({ onItemClick });

    const bellButton = await screen.findByRole('button', { name: /notifications/i });
    await user.click(bellButton);

    const notificationItem = await screen.findByText(/Bob Smith assigned you/i);
    await user.click(notificationItem);

    expect(onItemClick).toHaveBeenCalledTimes(1);
    expect(notificationsApi.markRead).toHaveBeenCalledWith('n1');
    expect(mockNavigate).toHaveBeenCalledWith('/boards/b1');
    expect(screen.queryByTestId('notifications-panel')).not.toBeInTheDocument();
  });

  it('closes on outside click and touchstart', async () => {
    const user = userEvent.setup();
    renderNotificationsBell();

    const bellButton = await screen.findByRole('button', { name: /notifications/i });
    await user.click(bellButton);

    expect(screen.getByTestId('notifications-panel')).toBeInTheDocument();

    // Trigger outside touchstart
    fireEvent.touchStart(document.body);
    expect(screen.queryByTestId('notifications-panel')).not.toBeInTheDocument();

    // Open again and test mousedown outside
    await user.click(bellButton);
    expect(screen.getByTestId('notifications-panel')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('notifications-panel')).not.toBeInTheDocument();
  });

  it('closes on Escape key press', async () => {
    const user = userEvent.setup();
    renderNotificationsBell();

    const bellButton = await screen.findByRole('button', { name: /notifications/i });
    await user.click(bellButton);

    expect(screen.getByTestId('notifications-panel')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('notifications-panel')).not.toBeInTheDocument();
  });
});
