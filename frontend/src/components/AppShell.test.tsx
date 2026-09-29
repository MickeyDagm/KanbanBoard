import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppShell from './AppShell';
import { AuthProvider } from '../contexts/AuthContext';
import { authApi } from '../lib/api/authApi';
import { teamsApi } from '../lib/api/teamsApi';
import { boardsApi } from '../lib/api/boardsApi';
import type { User } from '../types';

vi.mock('../lib/api/authApi', () => ({
  authApi: { me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() },
}));

vi.mock('../lib/api/teamsApi', () => ({
  teamsApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    addMemberByEmail: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
  },
}));

vi.mock('../lib/api/boardsApi', () => ({
  boardsApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('../lib/socket', () => {
  const socket = { on: vi.fn(() => () => {}), off: vi.fn(), connect: vi.fn() };
  return { getSocket: vi.fn(() => socket), connectSocket: vi.fn(), disconnectSocket: vi.fn() };
});

const mockUser: User = {
  id: 'u1',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  avatarColor: '#3b82f6',
  createdAt: '2026-09-01T10:00:00.000Z',
};

const renderAppShell = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authApi.me).mockResolvedValue({ user: mockUser } as never);
  vi.mocked(teamsApi.list).mockResolvedValue({
    teams: [{ id: 't1', name: 'Engineering', role: 'ADMIN', createdAt: '2026-09-01' }],
  } as never);
  vi.mocked(boardsApi.list).mockResolvedValue({
    boards: [
      {
        id: 'b1',
        teamId: 't1',
        title: 'Sprint Board',
        description: null,
        background: '#3b82f6',
        createdAt: '2026-09-01',
      },
    ],
  } as never);
});

describe('AppShell mobile responsiveness', () => {
  it('renders the mobile header with hamburger menu button', async () => {
    renderAppShell();

    const menuButton = await screen.findByRole('button', { name: 'Open navigation menu' });
    expect(menuButton).toBeInTheDocument();
  });

  it('opens and closes the mobile drawer when clicking menu and close buttons', async () => {
    const user = userEvent.setup();
    renderAppShell();

    const openButton = await screen.findByRole('button', { name: 'Open navigation menu' });
    await user.click(openButton);

    const closeButton = await screen.findByRole('button', { name: 'Close navigation menu' });
    expect(closeButton).toBeInTheDocument();

    await user.click(closeButton);
    expect(screen.queryByRole('button', { name: 'Close navigation menu' })).toBeInTheDocument();
    // After closing, the drawer class has -translate-x-full
    const mobileDrawer = closeButton.closest('aside');
    expect(mobileDrawer?.className).toContain('-translate-x-full');
  });

  it('closes mobile drawer when clicking a navigation link inside it', async () => {
    const user = userEvent.setup();
    renderAppShell();

    const openButton = await screen.findByRole('button', { name: 'Open navigation menu' });
    await user.click(openButton);

    const closeButton = await screen.findByRole('button', { name: 'Close navigation menu' });
    const mobileDrawer = closeButton.closest('aside')!;
    expect(mobileDrawer.className).toContain('translate-x-0');

    // Click 'All boards' link inside the drawer
    const allBoardsLinks = screen.getAllByRole('link', { name: /all boards/i });
    const drawerLink = allBoardsLinks.find((l) => mobileDrawer.contains(l));
    expect(drawerLink).toBeDefined();
    await user.click(drawerLink!);

    expect(mobileDrawer.className).toContain('-translate-x-full');
  });
});
