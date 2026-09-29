import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AuthForm from './AuthForm';
import { AuthProvider } from '../contexts/AuthContext';
import { authApi } from '../lib/api/authApi';
import type { User } from '../types';

vi.mock('../lib/api/authApi', () => ({
  authApi: {
    me: vi.fn(),
    login: vi.fn(),
    sendSignupOtp: vi.fn(),
    verifySignupOtp: vi.fn(),
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

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const renderForm = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthProvider>
          <AuthForm />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
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
        inviteCode: undefined,
      })
    );
    expect(authApi.register).not.toHaveBeenCalled();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Welcome back!'));
  });

  it('completes the 1.1-1.6 signup flow: email -> OTP -> name & password confirmation -> DB creation', async () => {
    vi.mocked(authApi.sendSignupOtp).mockResolvedValue({ ok: true, message: 'Code sent' });
    vi.mocked(authApi.verifySignupOtp).mockResolvedValue({
      ok: true,
      signupToken: 'test-signup-token',
    });
    vi.mocked(authApi.register).mockResolvedValue({ user: mockUser } as RegisterResponse);

    renderForm();

    // 1.1: Click signup
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }));

    // 1.2: Asked email
    expect(screen.getByLabelText('Email Address')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Email Address'), 'ada@example.com');

    // 1.3: Clicks to send email with OTP
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Email' }));
    await waitFor(() =>
      expect(authApi.sendSignupOtp).toHaveBeenCalledWith({ email: 'ada@example.com' })
    );

    // 1.4: Verify OTP step
    const codeInput = await screen.findByLabelText('6-digit code');
    expect(codeInput).toBeInTheDocument();
    await userEvent.type(codeInput, '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Verify & Proceed' }));

    await waitFor(() =>
      expect(authApi.verifySignupOtp).toHaveBeenCalledWith({
        email: 'ada@example.com',
        code: '123456',
      })
    );

    // 1.5: Asked name and password with confirmation
    const nameInput = await screen.findByLabelText('Name');
    const passwordInput = screen.getByLabelText('Password');
    const confirmInput = screen.getByLabelText('Confirm Password');

    await userEvent.type(nameInput, 'Ada Lovelace');
    await userEvent.type(passwordInput, 'password123');
    await userEvent.type(confirmInput, 'password123');

    // 1.6: Submits to create user in DB and log in
    const submitBtn = screen.getByRole('button', { name: 'Create Account & Sign In' });
    expect(submitBtn).toBeEnabled();
    await userEvent.click(submitBtn);

    await waitFor(() =>
      expect(authApi.register).toHaveBeenCalledWith({
        email: 'ada@example.com',
        name: 'Ada Lovelace',
        password: 'password123',
        signupToken: 'test-signup-token',
        inviteCode: undefined,
      })
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Account created successfully!'));
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

  it('walks from forgot password to the new-password step', async () => {
    vi.mocked(authApi.forgotPassword).mockResolvedValue({ ok: true });
    vi.mocked(authApi.resetPassword).mockResolvedValue({ ok: true });
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await userEvent.type(screen.getByLabelText('Email Address'), 'ada@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Set new password' })).toBeInTheDocument()
    );
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
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    );
  });
});
