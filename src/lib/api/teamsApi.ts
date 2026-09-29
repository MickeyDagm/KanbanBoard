import { apiFetch } from '../api';
import type { Role, Team, TeamDetail, TeamMember } from '../../types';

export const teamsApi = {
  list: () => apiFetch<{ teams: Team[] }>('/teams'),

  create: (name: string) => apiFetch<{ team: Team }>('/teams', { method: 'POST', body: { name } }),

  get: (id: string) => apiFetch<TeamDetail>(`/teams/${id}`),

  update: (id: string, name: string) =>
    apiFetch<{ team: Team }>(`/teams/${id}`, { method: 'PATCH', body: { name } }),

  remove: (id: string) => apiFetch<void>(`/teams/${id}`, { method: 'DELETE' }),

  updateMemberRole: (teamId: string, userId: string, role: Role) =>
    apiFetch<{ member: TeamMember }>(`/teams/${teamId}/members/${userId}`, {
      method: 'PATCH',
      body: { role },
    }),

  removeMember: (teamId: string, userId: string) =>
    apiFetch<void>(`/teams/${teamId}/members/${userId}`, { method: 'DELETE' }),

  addMemberByEmail: (teamId: string, email: string) =>
    apiFetch<{ member: TeamMember }>(`/teams/${teamId}/members`, {
      method: 'POST',
      body: { email },
    }),
};
