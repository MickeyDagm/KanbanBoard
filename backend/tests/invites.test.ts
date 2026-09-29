import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/lib/prisma.js';
import { addTeamMember, app, personalTeamId, registerUser, resetDb } from './helpers.js';

beforeEach(async () => {
  await resetDb();
});

async function createInviteVia(
  cookie: string,
  teamId: string,
  body: Record<string, unknown> = {}
): Promise<{ id: string; code: string; url: string }> {
  const res = await request(app)
    .post(`/api/teams/${teamId}/invites`)
    .set('Cookie', cookie)
    .send(body);
  if (res.status !== 201) {
    throw new Error(`createInvite failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { id: res.body.invite.id, code: res.body.invite.code, url: res.body.url };
}

describe('POST /api/teams/:teamId/invites', () => {
  it('creates an active invite with a redeem URL as ADMIN', async () => {
    const owner = await registerUser();
    const admin = await registerUser();
    const teamId = await personalTeamId(owner.id);
    await addTeamMember(teamId, admin.id, 'ADMIN');

    const res = await request(app)
      .post(`/api/teams/${teamId}/invites`)
      .set('Cookie', admin.cookie)
      .send({ role: 'MEMBER', expiresInDays: 7 });
    expect(res.status).toBe(201);
    expect(res.body.invite).toMatchObject({ role: 'MEMBER', status: 'active', usedCount: 0 });
    expect(res.body.invite.code).toBeTruthy();
    expect(res.body.invite.expiresAt).not.toBeNull();
    expect(res.body.url).toContain(`/invite/${res.body.invite.code}`);
  });

  it('forbids MEMBER from creating invites', async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const teamId = await personalTeamId(owner.id);
    await addTeamMember(teamId, member.id, 'MEMBER');

    const res = await request(app)
      .post(`/api/teams/${teamId}/invites`)
      .set('Cookie', member.cookie)
      .send({});
    expect(res.status).toBe(403);
  });

  it('404s for non-members', async () => {
    const owner = await registerUser();
    const outsider = await registerUser();
    const teamId = await personalTeamId(owner.id);

    const res = await request(app)
      .post(`/api/teams/${teamId}/invites`)
      .set('Cookie', outsider.cookie)
      .send({});
    expect(res.status).toBe(404);
  });
});

describe('GET /api/teams/:teamId/invites', () => {
  it('lists invites with computed status as ADMIN', async () => {
    const owner = await registerUser();
    const teamId = await personalTeamId(owner.id);
    await createInviteVia(owner.cookie, teamId);

    const res = await request(app).get(`/api/teams/${teamId}/invites`).set('Cookie', owner.cookie);
    expect(res.status).toBe(200);
    expect(res.body.invites).toHaveLength(1);
    expect(res.body.invites[0].status).toBe('active');
  });

  it('forbids MEMBER from listing invites', async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const teamId = await personalTeamId(owner.id);
    await addTeamMember(teamId, member.id, 'MEMBER');

    const res = await request(app).get(`/api/teams/${teamId}/invites`).set('Cookie', member.cookie);
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/invites/:id', () => {
  it('revokes an invite (status becomes revoked)', async () => {
    const owner = await registerUser();
    const teamId = await personalTeamId(owner.id);
    const invite = await createInviteVia(owner.cookie, teamId);

    const del = await request(app).delete(`/api/invites/${invite.id}`).set('Cookie', owner.cookie);
    expect(del.status).toBe(204);

    const list = await request(app).get(`/api/teams/${teamId}/invites`).set('Cookie', owner.cookie);
    expect(list.body.invites[0].status).toBe('revoked');
  });

  it('404s for unknown invite id', async () => {
    const owner = await registerUser();
    const res = await request(app).delete('/api/invites/nope').set('Cookie', owner.cookie);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/invites/:code', () => {
  it('previews an active invite with team, role and inviter', async () => {
    const owner = await registerUser();
    const viewer = await registerUser();
    const teamId = await personalTeamId(owner.id);
    const invite = await createInviteVia(owner.cookie, teamId, { role: 'ADMIN' });

    const res = await request(app)
      .get(`/api/invites/${invite.code}`)
      .set('Cookie', viewer.cookie);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      team: { id: teamId, name: 'Personal' },
      role: 'ADMIN',
      status: 'active',
      alreadyMember: false,
    });
    expect(res.body.inviter.email).toBe(owner.email);
  });

  it('flags already-member viewers', async () => {
    const owner = await registerUser();
    const teamId = await personalTeamId(owner.id);
    const invite = await createInviteVia(owner.cookie, teamId);

    const res = await request(app)
      .get(`/api/invites/${invite.code}`)
      .set('Cookie', owner.cookie);
    expect(res.body.alreadyMember).toBe(true);
  });

  it('reports expired invites', async () => {
    const owner = await registerUser();
    const viewer = await registerUser();
    const teamId = await personalTeamId(owner.id);
    const invite = await prisma.invite.create({
      data: {
        code: 'expired-code-1',
        teamId,
        createdById: owner.id,
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const res = await request(app).get(`/api/invites/${invite.code}`).set('Cookie', viewer.cookie);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('expired');
  });

  it('404s for unknown codes', async () => {
    const user = await registerUser();
    const res = await request(app).get('/api/invites/does-not-exist').set('Cookie', user.cookie);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/invites/:code/redeem', () => {
  it('joins the team with the invite role (idempotent on second redeem)', async () => {
    const owner = await registerUser();
    const joiner = await registerUser();
    const teamId = await personalTeamId(owner.id);
    const invite = await createInviteVia(owner.cookie, teamId, { role: 'ADMIN' });

    const first = await request(app)
      .post(`/api/invites/${invite.code}/redeem`)
      .set('Cookie', joiner.cookie);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ team: { id: teamId }, role: 'ADMIN', joined: true });

    const membership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: joiner.id } },
    });
    expect(membership?.role).toBe('ADMIN');

    const second = await request(app)
      .post(`/api/invites/${invite.code}/redeem`)
      .set('Cookie', joiner.cookie);
    expect(second.status).toBe(200);
    expect(second.body.joined).toBe(false);

    const refreshed = await prisma.invite.findUnique({ where: { id: invite.id } });
    expect(refreshed?.usedCount).toBe(1);
  });

  it('rejects revoked invites', async () => {
    const owner = await registerUser();
    const joiner = await registerUser();
    const teamId = await personalTeamId(owner.id);
    const invite = await createInviteVia(owner.cookie, teamId);
    await request(app).delete(`/api/invites/${invite.id}`).set('Cookie', owner.cookie);

    const res = await request(app)
      .post(`/api/invites/${invite.code}/redeem`)
      .set('Cookie', joiner.cookie);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/revoked/i);
  });

  it('rejects expired invites', async () => {
    const owner = await registerUser();
    const joiner = await registerUser();
    const teamId = await personalTeamId(owner.id);
    const invite = await prisma.invite.create({
      data: {
        code: 'expired-code-2',
        teamId,
        createdById: owner.id,
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const res = await request(app)
      .post(`/api/invites/${invite.code}/redeem`)
      .set('Cookie', joiner.cookie);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/expired/i);
  });

  it('enforces maxUses across different users', async () => {
    const owner = await registerUser();
    const first = await registerUser();
    const second = await registerUser();
    const teamId = await personalTeamId(owner.id);
    const invite = await createInviteVia(owner.cookie, teamId, { maxUses: 1 });

    const ok = await request(app)
      .post(`/api/invites/${invite.code}/redeem`)
      .set('Cookie', first.cookie);
    expect(ok.body.joined).toBe(true);

    const blocked = await request(app)
      .post(`/api/invites/${invite.code}/redeem`)
      .set('Cookie', second.cookie);
    expect(blocked.status).toBe(400);
    expect(blocked.body.error.message).toMatch(/use limit/i);
  });

  it('404s for unknown codes', async () => {
    const user = await registerUser();
    const res = await request(app)
      .post('/api/invites/unknown-code/redeem')
      .set('Cookie', user.cookie);
    expect(res.status).toBe(404);
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/invites/any/redeem');
    expect(res.status).toBe(401);
  });
});
