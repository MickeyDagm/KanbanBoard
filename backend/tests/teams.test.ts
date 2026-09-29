import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/lib/prisma.js';
import {
  addTeamMember,
  app,
  createBoard,
  personalTeamId,
  registerUser,
  resetDb,
} from './helpers.js';

beforeEach(async () => {
  await resetDb();
});

describe('GET /api/teams', () => {
  it('returns the Personal team with OWNER role after registration', async () => {
    const user = await registerUser();

    const res = await request(app).get('/api/teams').set('Cookie', user.cookie);
    expect(res.status).toBe(200);
    expect(res.body.teams).toHaveLength(1);
    expect(res.body.teams[0]).toMatchObject({ name: 'Personal', role: 'OWNER', memberCount: 1 });
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/teams');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/teams', () => {
  it('creates a team with the creator as OWNER', async () => {
    const user = await registerUser();

    const res = await request(app)
      .post('/api/teams')
      .set('Cookie', user.cookie)
      .send({ name: 'Acme Inc' });
    expect(res.status).toBe(201);
    expect(res.body.team).toMatchObject({ name: 'Acme Inc', role: 'OWNER', memberCount: 1 });

    const list = await request(app).get('/api/teams').set('Cookie', user.cookie);
    expect(list.body.teams.map((t: { name: string }) => t.name)).toContain('Acme Inc');
  });

  it('rejects an empty name', async () => {
    const user = await registerUser();
    const res = await request(app)
      .post('/api/teams')
      .set('Cookie', user.cookie)
      .send({ name: '   ' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/teams/:id', () => {
  it('returns the team with its members', async () => {
    const owner = await registerUser();
    const joiner = await registerUser();
    const teamId = await personalTeamId(owner.id);
    await addTeamMember(teamId, joiner.id, 'MEMBER');

    const res = await request(app).get(`/api/teams/${teamId}`).set('Cookie', owner.cookie);
    expect(res.status).toBe(200);
    expect(res.body.team.id).toBe(teamId);
    expect(res.body.role).toBe('OWNER');
    expect(res.body.members).toHaveLength(2);
    const roles = res.body.members.map((m: { role: string }) => m.role).sort();
    expect(roles).toEqual(['MEMBER', 'OWNER']);
    expect(res.body.members[0].user).toHaveProperty('email');
  });

  it('hides teams from non-members with 404', async () => {
    const owner = await registerUser();
    const outsider = await registerUser();
    const teamId = await personalTeamId(owner.id);

    const res = await request(app).get(`/api/teams/${teamId}`).set('Cookie', outsider.cookie);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/teams/:id', () => {
  it('renames a team as ADMIN', async () => {
    const owner = await registerUser();
    const admin = await registerUser();
    const teamId = await personalTeamId(owner.id);
    await addTeamMember(teamId, admin.id, 'ADMIN');

    const res = await request(app)
      .patch(`/api/teams/${teamId}`)
      .set('Cookie', admin.cookie)
      .send({ name: 'Renamed Team' });
    expect(res.status).toBe(200);
    expect(res.body.team.name).toBe('Renamed Team');
  });

  it('forbids MEMBER from renaming', async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const teamId = await personalTeamId(owner.id);
    await addTeamMember(teamId, member.id, 'MEMBER');

    const res = await request(app)
      .patch(`/api/teams/${teamId}`)
      .set('Cookie', member.cookie)
      .send({ name: 'Nope' });
    expect(res.status).toBe(403);
  });

  it('hides teams from non-members with 404', async () => {
    const owner = await registerUser();
    const outsider = await registerUser();
    const teamId = await personalTeamId(owner.id);

    const res = await request(app)
      .patch(`/api/teams/${teamId}`)
      .set('Cookie', outsider.cookie)
      .send({ name: 'Nope' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/teams/:id', () => {
  it('deletes the team as OWNER, cascading members, invites and boards', async () => {
    const owner = await registerUser();
    const teamId = await personalTeamId(owner.id);
    const board = await createBoard(owner, 'Doomed Board');
    await prisma.invite.create({
      data: {
        code: 'doomed-invite-code',
        teamId,
        createdById: owner.id,
      },
    });

    const res = await request(app).delete(`/api/teams/${teamId}`).set('Cookie', owner.cookie);
    expect(res.status).toBe(204);

    expect(await prisma.team.findUnique({ where: { id: teamId } })).toBeNull();
    expect(await prisma.board.findUnique({ where: { id: board.id } })).toBeNull();
    expect(await prisma.teamMember.count({ where: { teamId } })).toBe(0);
    expect(await prisma.invite.count({ where: { teamId } })).toBe(0);
  });

  it('forbids ADMIN from deleting the team (OWNER only)', async () => {
    const owner = await registerUser();
    const admin = await registerUser();
    const teamId = await personalTeamId(owner.id);
    await addTeamMember(teamId, admin.id, 'ADMIN');

    const res = await request(app).delete(`/api/teams/${teamId}`).set('Cookie', admin.cookie);
    expect(res.status).toBe(403);
    expect(await prisma.team.findUnique({ where: { id: teamId } })).not.toBeNull();
  });
});

describe('PATCH /api/teams/:id/members/:userId', () => {
  it('lets OWNER promote a MEMBER to ADMIN', async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const teamId = await personalTeamId(owner.id);
    await addTeamMember(teamId, member.id, 'MEMBER');

    const res = await request(app)
      .patch(`/api/teams/${teamId}/members/${member.id}`)
      .set('Cookie', owner.cookie)
      .send({ role: 'ADMIN' });
    expect(res.status).toBe(200);
    expect(res.body.member.role).toBe('ADMIN');
  });

  it('forbids ADMIN from granting OWNER', async () => {
    const owner = await registerUser();
    const admin = await registerUser();
    const member = await registerUser();
    const teamId = await personalTeamId(owner.id);
    await addTeamMember(teamId, admin.id, 'ADMIN');
    await addTeamMember(teamId, member.id, 'MEMBER');

    const res = await request(app)
      .patch(`/api/teams/${teamId}/members/${member.id}`)
      .set('Cookie', admin.cookie)
      .send({ role: 'OWNER' });
    expect(res.status).toBe(403);
  });

  it('forbids ADMIN from changing an OWNER’s role', async () => {
    const owner = await registerUser();
    const admin = await registerUser();
    const teamId = await personalTeamId(owner.id);
    await addTeamMember(teamId, admin.id, 'ADMIN');

    const res = await request(app)
      .patch(`/api/teams/${teamId}/members/${owner.id}`)
      .set('Cookie', admin.cookie)
      .send({ role: 'MEMBER' });
    expect(res.status).toBe(403);
  });

  it('refuses to demote the last OWNER', async () => {
    const owner = await registerUser();
    const teamId = await personalTeamId(owner.id);

    const res = await request(app)
      .patch(`/api/teams/${teamId}/members/${owner.id}`)
      .set('Cookie', owner.cookie)
      .send({ role: 'MEMBER' });
    expect(res.status).toBe(409);
  });

  it('allows demoting an OWNER when another OWNER exists', async () => {
    const owner = await registerUser();
    const coOwner = await registerUser();
    const teamId = await personalTeamId(owner.id);
    await addTeamMember(teamId, coOwner.id, 'OWNER');

    const res = await request(app)
      .patch(`/api/teams/${teamId}/members/${owner.id}`)
      .set('Cookie', owner.cookie)
      .send({ role: 'ADMIN' });
    expect(res.status).toBe(200);
    expect(res.body.member.role).toBe('ADMIN');
  });

  it('404s for a user who is not a member', async () => {
    const owner = await registerUser();
    const outsider = await registerUser();
    const teamId = await personalTeamId(owner.id);

    const res = await request(app)
      .patch(`/api/teams/${teamId}/members/${outsider.id}`)
      .set('Cookie', owner.cookie)
      .send({ role: 'ADMIN' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/teams/:id/members/:userId', () => {
  it('lets a MEMBER leave the team', async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const teamId = await personalTeamId(owner.id);
    await addTeamMember(teamId, member.id, 'MEMBER');

    const res = await request(app)
      .delete(`/api/teams/${teamId}/members/${member.id}`)
      .set('Cookie', member.cookie);
    expect(res.status).toBe(204);
    expect(
      await prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId: member.id } },
      })
    ).toBeNull();
  });

  it('refuses to remove the last OWNER (even self-leave)', async () => {
    const owner = await registerUser();
    const teamId = await personalTeamId(owner.id);

    const res = await request(app)
      .delete(`/api/teams/${teamId}/members/${owner.id}`)
      .set('Cookie', owner.cookie);
    expect(res.status).toBe(409);
  });

  it('forbids MEMBER from removing someone else', async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const other = await registerUser();
    const teamId = await personalTeamId(owner.id);
    await addTeamMember(teamId, member.id, 'MEMBER');
    await addTeamMember(teamId, other.id, 'MEMBER');

    const res = await request(app)
      .delete(`/api/teams/${teamId}/members/${other.id}`)
      .set('Cookie', member.cookie);
    expect(res.status).toBe(403);
  });

  it('lets ADMIN remove a MEMBER but not an OWNER', async () => {
    const owner = await registerUser();
    const admin = await registerUser();
    const member = await registerUser();
    const teamId = await personalTeamId(owner.id);
    await addTeamMember(teamId, admin.id, 'ADMIN');
    await addTeamMember(teamId, member.id, 'MEMBER');

    const removeMember = await request(app)
      .delete(`/api/teams/${teamId}/members/${member.id}`)
      .set('Cookie', admin.cookie);
    expect(removeMember.status).toBe(204);

    const removeOwner = await request(app)
      .delete(`/api/teams/${teamId}/members/${owner.id}`)
      .set('Cookie', admin.cookie);
    expect(removeOwner.status).toBe(403);
  });
});

describe('POST /api/teams/:id/members', () => {
  it('adds an existing user by email as MEMBER', async () => {
    const owner = await registerUser();
    const invitee = await registerUser();
    const teamId = await personalTeamId(owner.id);

    const res = await request(app)
      .post(`/api/teams/${teamId}/members`)
      .set('Cookie', owner.cookie)
      .send({ email: invitee.email });
    expect(res.status).toBe(201);
    expect(res.body.member).toMatchObject({ userId: invitee.id, role: 'MEMBER' });
    expect(res.body.member.user.email).toBe(invitee.email);
  });

  it('404s for an unknown email', async () => {
    const owner = await registerUser();
    const teamId = await personalTeamId(owner.id);

    const res = await request(app)
      .post(`/api/teams/${teamId}/members`)
      .set('Cookie', owner.cookie)
      .send({ email: 'ghost@example.com' });
    expect(res.status).toBe(404);
  });

  it('409s for an existing member', async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const teamId = await personalTeamId(owner.id);
    await addTeamMember(teamId, member.id, 'MEMBER');

    const res = await request(app)
      .post(`/api/teams/${teamId}/members`)
      .set('Cookie', owner.cookie)
      .send({ email: member.email });
    expect(res.status).toBe(409);
  });

  it('forbids MEMBER from adding others', async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const other = await registerUser();
    const teamId = await personalTeamId(owner.id);
    await addTeamMember(teamId, member.id, 'MEMBER');

    const res = await request(app)
      .post(`/api/teams/${teamId}/members`)
      .set('Cookie', member.cookie)
      .send({ email: other.email });
    expect(res.status).toBe(403);
  });
});
