import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';
import AuthForm from './AuthForm';
import { AuthProvider } from '../contexts/AuthContext';
import { authApi } from '../lib/api/authApi';
import type { User } from '../types';

vi.mock('../lib/api/authApi', () => ({
  authApi: {
    me: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    verifyEmail: vi.fn(),
    resendVerification: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  },
}));
vi.mock('../lib/socket', () => ({
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
}));
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const mockUser: User = {
  id: 'u1',
  email: 'ada@example.com',
  name: 'Ada',
  avatarColor: '#3b82f6',
  createdAt: '2026-09-01T10:00:00.000Z',
};

type MeResponse = Awaited<ReturnType<typeof authApi.me>>;
type LoginResponse = Awaited<ReturnType<typeof authApi.login>>;
type RegisterResponse = Awaited<ReturnType<typeof authApi.register>>;

const renderForm = () =>
  render(
    <AuthProvider>
      <AuthForm />
    </AuthProvider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authApi.me).mockResolvedValue({ user: null } as unknown as MeResponse);
});

describe('AuthForm', () => {
  it('submits the sign-in form to authApi.login', async () => {
    vi.mocked(authApi.login).mockResolvedValue({ user: mockUser } as LoginResponse);
    renderForm();

    await userEvent.type(screen.getByLabelText('Email Address'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() =>
      expect(authApi.login).toHaveBeenCalledWith({
        email: 'ada@example.com',
        password: 'password123',
      })
    );
    expect(authApi.register).not.toHaveBeenCalled();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Welcome back!'));
  });

  it('switches to sign-up and submits to authApi.register', async () => {
    vi.mocked(authApi.register).mockResolvedValue({ user: mockUser } as RegisterResponse);
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: "Don't have an account? Sign up" }));
    await userEvent.type(screen.getByLabelText('Name'), 'Ada Lovelace');
    await userEvent.type(screen.getByLabelText('Email Address'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() =>
      expect(authApi.register).toHaveBeenCalledWith({
        email: 'ada@example.com',
        password: 'password123',
        name: 'Ada Lovelace',
      })
    );
    expect(authApi.login).not.toHaveBeenCalled();
  });

  it('disables the submit button while a request is in flight', async () => {
    let resolveLogin!: (value: LoginResponse) => void;
    vi.mocked(authApi.login).mockReturnValue(
      new Promise<LoginResponse>((resolve) => {
        resolveLogin = resolve;
      })
    );
    renderForm();

    await userEvent.type(screen.getByLabelText('Email Address'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    const button = screen.getByRole('button', { name: 'Sign In' });
    await userEvent.click(button);

    expect(button).toBeDisabled();

    resolveLogin({ user: mockUser });
    await waitFor(() => expect(button).toBeEnabled());
  });

  it('surfaces a sign-in failure via toast.error and re-enables the form', async () => {
    vi.mocked(authApi.login).mockRejectedValue(new Error('Invalid credentials'));
    renderForm();

    await userEvent.type(screen.getByLabelText('Email Address'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Invalid credentials'));
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled();
  });

  it('moves to the code step when sign-up needs email verification', async () => {
    vi.mocked(authApi.register).mockResolvedValue({
      user: mockUser,
      requiresVerification: true,
    } as RegisterResponse);
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: "Don't have an account? Sign up" }));
    await userEvent.type(screen.getByLabelText('Name'), 'Ada Lovelace');
    await userEvent.type(screen.getByLabelText('Email Address'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => expect(screen.getByText('Check your inbox')).toBeInTheDocument());
    expect(screen.getByLabelText('6-digit code')).toBeInTheDocument();
    expect(authApi.verifyEmail).not.toHaveBeenCalled();
  });

  it('submits the code to authApi.verifyEmail', async () => {
    vi.mocked(authApi.register).mockResolvedValue({
      user: mockUser,
      requiresVerification: true,
    } as RegisterResponse);
    vi.mocked(authApi.verifyEmail).mockResolvedValue({ user: mockUser });
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: "Don't have an account? Sign up" }));
    await userEvent.type(screen.getByLabelText('Name'), 'Ada Lovelace');
    await userEvent.type(screen.getByLabelText('Email Address'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    const codeInput = await screen.findByLabelText('6-digit code');
    const verifyButton = screen.getByRole('button', { name: 'Verify & continue' });
    expect(verifyButton).toBeDisabled();

    await userEvent.type(codeInput, '123456');
    expect(verifyButton).toBeEnabled();
    await userEvent.click(verifyButton);

    await waitFor(() =>
      expect(authApi.verifyEmail).toHaveBeenCalledWith({
        email: 'ada@example.com',
        code: '123456',
      })
    );
  });

  it('walks from forgot password to the new-password step', async () => {
    vi.mocked(authApi.forgotPassword).mockResolvedValue({ ok: true });
    vi.mocked(authApi.resetPassword).mockResolvedValue({ ok: true });
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await userEvent.type(screen.getByLabelText('Email Address'), 'ada@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));

    await waitFor(() => expect(screen.getByText('Choose a new password')).toBeInTheDocument());
    expect(authApi.forgotPassword).toHaveBeenCalledWith({ email: 'ada@example.com' });
    await userEvent.type(screen.getByLabelText('6-digit code'), '654321');
    await userEvent.type(screen.getByLabelText('New password'), 'brandnewpass1');
    await userEvent.click(screen.getByRole('button', { name: 'Set new password' }));

    await waitFor(() =>
      expect(authApi.resetPassword).toHaveBeenCalledWith({
        email: 'ada@example.com',
        code: '654321',
        password: 'brandnewpass1',
      })
    );
    await waitFor(() => expect(screen.getByText('Welcome Back')).toBeInTheDocument());
  });
});
