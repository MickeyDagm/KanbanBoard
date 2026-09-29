import { apiFetch } from '../api';
import type { Invite, InvitePreview, Role, Team } from '../../types';

export interface CreateInviteBody {
  role?: Role;
  expiresInDays?: number;
  maxUses?: number | null;
}

export const invitesApi = {
  create: (teamId: string, body: CreateInviteBody = {}) =>
    apiFetch<{ invite: Invite; url: string }>(`/teams/${teamId}/invites`, {
      method: 'POST',
      body,
    }),

  sendEmail: (teamId: string, body: CreateInviteBody & { email: string }) =>
    apiFetch<{ invite: Invite; url: string; sentTo: string }>(
      `/teams/${teamId}/invites/email`,
      { method: 'POST', body }
    ),

  list: (teamId: string) =>
    apiFetch<{ invites: Invite[]; emailConfigured?: boolean }>(`/teams/${teamId}/invites`),

  revoke: (id: string) => apiFetch<void>(`/invites/${id}`, { method: 'DELETE' }),

  preview: (code: string) => apiFetch<InvitePreview>(`/invites/${code}`),

  redeem: (code: string) =>
    apiFetch<{ team: Pick<Team, 'id' | 'name'>; role: Role; joined: boolean }>(
      `/invites/${code}/redeem`,
      { method: 'POST' }
    ),
};
