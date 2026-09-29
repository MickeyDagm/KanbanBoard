import { apiFetch } from '../api';
import type { User } from '../../types';

export const authApi = {
  sendSignupOtp: (body: { email: string }) =>
    apiFetch<{ ok: true; message: string }>('/auth/signup/send-otp', {
      method: 'POST',
      body,
    }),

  verifySignupOtp: (body: { email: string; code: string }) =>
    apiFetch<{ ok: true; signupToken: string }>('/auth/signup/verify-otp', {
      method: 'POST',
      body,
    }),

  register: (body: {
    email: string;
    password: string;
    name: string;
    signupToken?: string;
    inviteCode?: string;
  }) =>
    apiFetch<{ user: User; joinedTeamId?: string }>('/auth/register', {
      method: 'POST',
      body,
    }),

  verifyEmail: (body: { email: string; code: string }) =>
    apiFetch<{ user: User }>('/auth/verify-email', { method: 'POST', body }),

  resendVerification: (body: { email: string }) =>
    apiFetch<{ ok: true }>('/auth/resend-verification', { method: 'POST', body }),

  forgotPassword: (body: { email: string }) =>
    apiFetch<{ ok: true }>('/auth/forgot-password', { method: 'POST', body }),

  resetPassword: (body: { email: string; code: string; password: string }) =>
    apiFetch<{ ok: true }>('/auth/reset-password', { method: 'POST', body }),

  login: (body: { email: string; password: string; inviteCode?: string }) =>
    apiFetch<{ user: User; joinedTeamId?: string }>('/auth/login', {
      method: 'POST',
      body,
    }),

  logout: () => apiFetch<{ ok: true }>('/auth/logout', { method: 'POST' }),

  me: () => apiFetch<{ user: User }>('/auth/me'),
};
