import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/lib/prisma.js';
import { addTeamMember, app, personalTeamId, registerUser, resetDb } from './helpers.js';

const mocks = vi.hoisted(() => ({
  configured: true,
  sendInviteEmail: vi.fn(),
  sendOtpEmail: vi.fn(),
}));

vi.mock('../src/services/emailService.js', () => ({
  isEmailConfigured: () => mocks.configured,
  sendInviteEmail: (...args: unknown[]) => mocks.sendInviteEmail(...args),
  // With SMTP on, registration waits for an OTP — the shared registerUser
  // helper completes that step using the code this mock receives.
  sendOtpEmail: (...args: unknown[]) => mocks.sendOtpEmail(...args),
}));

beforeEach(async () => {
  await resetDb();
  mocks.configured = true;
  mocks.sendInviteEmail.mockReset();
  mocks.sendInviteEmail.mockResolvedValue(undefined);
  mocks.sendOtpEmail.mockReset();
  mocks.sendOtpEmail.mockResolvedValue(undefined);
});

function sendInvite(
  cookie: string,
  teamId: string,
  body: Record<string, unknown> = {}
): request.Test {
  return request(app)
    .post(`/api/teams/${teamId}/invites/email`)
    .set('Cookie', cookie)
    .send({ email: 'friend@example.com', ...body });
}

describe('POST /api/teams/:teamId/invites/email', () => {
  it('creates an invite and emails the link as ADMIN', async () => {
    const owner = await registerUser();
    const teamId = await personalTeamId(owner.id);

    const res = await sendInvite(owner.cookie, teamId, { role: 'MEMBER', expiresInDays: 7 });

    expect(res.status).toBe(201);
    expect(res.body.sentTo).toBe('friend@example.com');
    expect(res.body.invite).toMatchObject({ role: 'MEMBER', status: 'active', usedCount: 0 });
    expect(res.body.url).toContain(`/invite/${res.body.invite.code}`);

    expect(mocks.sendInviteEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'friend@example.com',
        teamName: 'Personal',
        inviterName: expect.any(String),
        role: 'MEMBER',
        url: res.body.url,
        expiresAt: expect.any(Date),
      })
    );

    const stored = await prisma.invite.findUnique({ where: { id: res.body.invite.id } });
    expect(stored).not.toBeNull();
  });

  it('rejects the request without creating an invite when SMTP is not configured', async () => {
    const owner = await registerUser();
    const teamId = await personalTeamId(owner.id);
    mocks.configured = false;

    const res = await sendInvite(owner.cookie, teamId);

    expect(res.status).toBe(503);
    expect(res.body.error.message).toMatch(/SMTP_HOST/);
    expect(mocks.sendInviteEmail).not.toHaveBeenCalled();
    expect(await prisma.invite.count({ where: { teamId } })).toBe(0);
  });

  it('leaves no invite behind when the send fails', async () => {
    const owner = await registerUser();
    const teamId = await personalTeamId(owner.id);
    mocks.sendInviteEmail.mockRejectedValue(new Error('connection refused'));

    const res = await sendInvite(owner.cookie, teamId);

    expect(res.status).toBe(502);
    expect(res.body.error.message).toMatch(/SMTP settings/i);
    expect(await prisma.invite.count({ where: { teamId } })).toBe(0);
  });

  it('validates the email address', async () => {
    const owner = await registerUser();
    const teamId = await personalTeamId(owner.id);

    const res = await sendInvite(owner.cookie, teamId, { email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(mocks.sendInviteEmail).not.toHaveBeenCalled();
  });

  it('forbids MEMBER from sending invites', async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const teamId = await personalTeamId(owner.id);
    await addTeamMember(teamId, member.id, 'MEMBER');

    const res = await sendInvite(member.cookie, teamId);

    expect(res.status).toBe(403);
    expect(mocks.sendInviteEmail).not.toHaveBeenCalled();
  });

  it('404s for non-members', async () => {
    const owner = await registerUser();
    const outsider = await registerUser();
    const teamId = await personalTeamId(owner.id);

    const res = await sendInvite(outsider.cookie, teamId);

    expect(res.status).toBe(404);
  });

  it('requires authentication', async () => {
    const owner = await registerUser();
    const teamId = await personalTeamId(owner.id);

    const res = await request(app)
      .post(`/api/teams/${teamId}/invites/email`)
      .send({ email: 'friend@example.com' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/teams/:teamId/invites', () => {
  it('reports whether outbound email is configured', async () => {
    const owner = await registerUser();
    const teamId = await personalTeamId(owner.id);

    const on = await request(app).get(`/api/teams/${teamId}/invites`).set('Cookie', owner.cookie);
    expect(on.body.emailConfigured).toBe(true);

    mocks.configured = false;
    const off = await request(app).get(`/api/teams/${teamId}/invites`).set('Cookie', owner.cookie);
    expect(off.body.emailConfigured).toBe(false);
  });
});
