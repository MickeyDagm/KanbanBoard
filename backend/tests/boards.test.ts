import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  addTeamMember,
  app,
  createBoard,
  createCard,
  createList,
  registerUser,
  resetDb,
} from './helpers.js';
import { prisma } from '../src/lib/prisma.js';

beforeEach(async () => {
  await resetDb();
});

describe('POST /api/boards', () => {
  it('creates a board in the personal team', async () => {
    const user = await registerUser();
    const board = await createBoard(user, 'My Board');

    expect(board.title).toBe('My Board');

    const stored = await prisma.board.findUnique({ where: { id: board.id } });
    expect(stored?.createdById).toBe(user.id);
  });

  it('rejects board creation on a team the user is not a member of (404)', async () => {
    const owner = await registerUser();
    const stranger = await registerUser();
    const teamId = await (async () => {
      const board = await createBoard(owner);
      return board.teamId;
    })();

    const res = await request(app)
      .post('/api/boards')
      .set('Cookie', stranger.cookie)
      .send({ teamId, title: 'Nope' });
    expect(res.status).toBe(404);
  });

  it('forbids MEMBER from creating a board (403) but allows ADMIN', async () => {
    const owner = await registerUser();
    const board = await createBoard(owner);

    const member = await registerUser();
    await addTeamMember(board.teamId, member.id, 'MEMBER');

    const asMember = await request(app)
      .post('/api/boards')
      .set('Cookie', member.cookie)
      .send({ teamId: board.teamId, title: 'Member board' });
    expect(asMember.status).toBe(403);

    const admin = await registerUser();
    await addTeamMember(board.teamId, admin.id, 'ADMIN');

    const asAdmin = await request(app)
      .post('/api/boards')
      .set('Cookie', admin.cookie)
      .send({ teamId: board.teamId, title: 'Admin board' });
    expect(asAdmin.status).toBe(201);
  });
});

describe('GET /api/boards/:id', () => {
  it('returns the full payload: lists, cards, labels, members, membership', async () => {
    const user = await registerUser();
    const board = await createBoard(user);
    const list = await createList(user, board.id, 'To Do');
    await createCard(user, list.id, 'First task');

    const res = await request(app).get(`/api/boards/${board.id}`).set('Cookie', user.cookie);

    expect(res.status).toBe(200);
    expect(res.body.board.id).toBe(board.id);
    expect(res.body.membership.role).toBe('OWNER');
    expect(res.body.lists).toHaveLength(1);
    expect(res.body.cards).toHaveLength(1);
    expect(res.body.cards[0]).toMatchObject({ title: 'First task', labels: [], assignees: [] });
    expect(res.body.members).toHaveLength(1);
    expect(res.body.labels).toEqual([]);
  });

  it('hides boards from non-members with 404', async () => {
    const owner = await registerUser();
    const board = await createBoard(owner);
    const stranger = await registerUser();

    const res = await request(app).get(`/api/boards/${board.id}`).set('Cookie', stranger.cookie);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('requires authentication', async () => {
    const owner = await registerUser();
    const board = await createBoard(owner);
    const res = await request(app).get(`/api/boards/${board.id}`);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/boards', () => {
  it('lists only boards from teams the user belongs to', async () => {
    const owner = await registerUser();
    await createBoard(owner, 'Owner board');

    const stranger = await registerUser();
    await createBoard(stranger, 'Stranger board');

    const res = await request(app).get('/api/boards').set('Cookie', owner.cookie);
    expect(res.status).toBe(200);
    expect(res.body.boards).toHaveLength(1);
    expect(res.body.boards[0].title).toBe('Owner board');
    expect(res.body.boards[0].role).toBe('OWNER');
  });
});

describe('DELETE /api/boards/:id', () => {
  it('cascades to lists and cards', async () => {
    const user = await registerUser();
    const board = await createBoard(user);
    const list = await createList(user, board.id, 'To Do');
    await createCard(user, list.id, 'Doomed task');

    const res = await request(app).delete(`/api/boards/${board.id}`).set('Cookie', user.cookie);
    expect(res.status).toBe(204);

    expect(await prisma.board.count({ where: { id: board.id } })).toBe(0);
    expect(await prisma.list.count()).toBe(0);
    expect(await prisma.card.count()).toBe(0);
  });

  it('forbids MEMBER from deleting a board', async () => {
    const owner = await registerUser();
    const board = await createBoard(owner);
    const member = await registerUser();
    await addTeamMember(board.teamId, member.id, 'MEMBER');

    const res = await request(app)
      .delete(`/api/boards/${board.id}`)
      .set('Cookie', member.cookie);
    expect(res.status).toBe(403);
    expect(await prisma.board.count({ where: { id: board.id } })).toBe(1);
  });
});
