import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  addTeamMember,
  app,
  createBoard,
  createCard,
  createList,
  personalTeamId,
  registerUser,
  resetDb,
  TestUser,
} from './helpers.js';
import { prisma } from '../src/lib/prisma.js';

let user: TestUser;
let boardId: string;
let listA: { id: string };
let listB: { id: string };

async function positionsOf(listId: string): Promise<{ id: string; title: string; position: number }[]> {
  return prisma.card.findMany({
    where: { listId },
    orderBy: { position: 'asc' },
    select: { id: true, title: true, position: true },
  });
}

beforeEach(async () => {
  await resetDb();
  user = await registerUser();
  boardId = (await createBoard(user)).id;
  listA = await createList(user, boardId, 'To Do');
  listB = await createList(user, boardId, 'Done');
});

describe('card creation', () => {
  it('appends cards with increasing positions', async () => {
    const c1 = await createCard(user, listA.id, 'One');
    const c2 = await createCard(user, listA.id, 'Two');
    const c3 = await createCard(user, listA.id, 'Three');

    expect([c1.position, c2.position, c3.position]).toEqual([0, 1, 2]);

    const rows = await positionsOf(listA.id);
    expect(rows.map((r) => r.title)).toEqual(['One', 'Two', 'Three']);
  });

  it('reuses positions correctly after a deletion (max+1, not count)', async () => {
    await createCard(user, listA.id, 'One');
    const c2 = await createCard(user, listA.id, 'Two');
    await createCard(user, listA.id, 'Three');

    // delete the middle card, then append — position must be max+1 = 3, not 2
    await request(app).delete(`/api/cards/${c2.id}`).set('Cookie', user.cookie);
    const c4 = await createCard(user, listA.id, 'Four');
    expect(c4.position).toBe(3);
  });
});

describe('POST /api/cards/:id/move', () => {
  it('reorders a card within the same list', async () => {
    const a = await createCard(user, listA.id, 'A');
    await createCard(user, listA.id, 'B');
    await createCard(user, listA.id, 'C');

    const res = await request(app)
      .post(`/api/cards/${a.id}/move`)
      .set('Cookie', user.cookie)
      .send({ index: 2 });
    expect(res.status).toBe(200);

    const rows = await positionsOf(listA.id);
    expect(rows.map((r) => r.title)).toEqual(['B', 'C', 'A']);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
  });

  it('moves a card across lists and reindexes the source list', async () => {
    const a = await createCard(user, listA.id, 'A');
    await createCard(user, listA.id, 'B');
    await createCard(user, listA.id, 'C');

    const res = await request(app)
      .post(`/api/cards/${a.id}/move`)
      .set('Cookie', user.cookie)
      .send({ listId: listB.id, index: 0 });
    expect(res.status).toBe(200);
    expect(res.body.card.listId).toBe(listB.id);

    expect((await positionsOf(listB.id)).map((r) => r.title)).toEqual(['A']);
    expect((await positionsOf(listA.id)).map((r) => r.title)).toEqual(['B', 'C']);
    const source = await positionsOf(listA.id);
    expect(source.map((r) => r.position)).toEqual([0, 1]);
  });

  it('clamps an out-of-range index to the end of the list', async () => {
    const a = await createCard(user, listA.id, 'A');
    await createCard(user, listA.id, 'B');

    await request(app)
      .post(`/api/cards/${a.id}/move`)
      .set('Cookie', user.cookie)
      .send({ index: 99 });

    expect((await positionsOf(listA.id)).map((r) => r.title)).toEqual(['B', 'A']);
  });

  it('rejects a target list from a different board with 404', async () => {
    const a = await createCard(user, listA.id, 'A');
    const otherBoard = await createBoard(user, 'Other');
    const otherList = await createList(user, otherBoard.id, 'Elsewhere');

    const res = await request(app)
      .post(`/api/cards/${a.id}/move`)
      .set('Cookie', user.cookie)
      .send({ listId: otherList.id, index: 0 });
    expect(res.status).toBe(404);

    // card stayed put
    const rows = await positionsOf(listA.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('A');
  });

  it('records CARD_CREATED and CARD_MOVED activity', async () => {
    const a = await createCard(user, listA.id, 'A');

    await request(app)
      .post(`/api/cards/${a.id}/move`)
      .set('Cookie', user.cookie)
      .send({ listId: listB.id, index: 0 });

    const activities = await prisma.activity.findMany({ where: { cardId: a.id } });
    const types = activities.map((x) => x.type);
    expect(types).toContain('CARD_CREATED');
    expect(types).toContain('CARD_MOVED');
  });
});

describe('permissions on cards', () => {
  it('hides cards from non-members with 404', async () => {
    const a = await createCard(user, listA.id, 'A');
    const stranger = await registerUser();

    const res = await request(app).get(`/api/cards/${a.id}`).set('Cookie', stranger.cookie);
    expect(res.status).toBe(404);
  });

  it('allows a MEMBER to create and edit cards', async () => {
    const member = await registerUser();
    const teamId = await personalTeamId(user.id);
    await addTeamMember(teamId, member.id, 'MEMBER');

    const card = await createCard(member, listA.id, 'Member card');
    expect(card.title).toBe('Member card');

    const patch = await request(app)
      .patch(`/api/cards/${card.id}`)
      .set('Cookie', member.cookie)
      .send({ title: 'Renamed by member' });
    expect(patch.status).toBe(200);
    expect(patch.body.card.title).toBe('Renamed by member');
  });
});

describe('PATCH /api/cards/:id', () => {
  it('updates fields and parses due dates', async () => {
    const a = await createCard(user, listA.id, 'A');

    const res = await request(app)
      .patch(`/api/cards/${a.id}`)
      .set('Cookie', user.cookie)
      .send({ priority: 'HIGH', dueDate: '2026-10-15', description: 'Details' });

    expect(res.status).toBe(200);
    expect(res.body.card.priority).toBe('HIGH');
    expect(res.body.card.description).toBe('Details');
    expect(new Date(res.body.card.dueDate).toISOString()).toContain('2026-10-15');

    const cleared = await request(app)
      .patch(`/api/cards/${a.id}`)
      .set('Cookie', user.cookie)
      .send({ dueDate: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.card.dueDate).toBeNull();
  });

  it('rejects an empty patch with 400', async () => {
    const a = await createCard(user, listA.id, 'A');
    const res = await request(app)
      .patch(`/api/cards/${a.id}`)
      .set('Cookie', user.cookie)
      .send({});
    expect(res.status).toBe(400);
  });
});
