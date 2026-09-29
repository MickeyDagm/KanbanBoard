import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { closeSocket, initSocket } from '../src/realtime/socket.js';
import {
  addTeamMember,
  app,
  createBoard,
  createCard,
  createList,
  registerUser,
  resetDb,
} from './helpers.js';

// ── realtime harness (subset of realtime.test.ts) ───────────────────────────
let server: http.Server;
let baseUrl: string;
const clients: ClientSocket[] = [];

beforeAll(async () => {
  server = http.createServer(createApp());
  initSocket(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const c of clients) c.disconnect();
  clients.length = 0;
  closeSocket();
  if (server.listening) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  for (const c of clients) c.disconnect();
  clients.length = 0;
});

function connectClient(cookie?: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioc(baseUrl, {
      extraHeaders: cookie ? { cookie } : {},
      reconnection: false,
      transports: ['websocket'],
    });
    clients.push(socket);
    const timer = setTimeout(() => reject(new Error('connect timeout')), 5000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function joinRoom(socket: ClientSocket, id: string) {
  return new Promise<{ ok: boolean; error?: string }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('join ack timeout')), 5000);
    socket.emit('board:join', id, (res: { ok: boolean; error?: string }) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

function waitForEvent<T = Record<string, unknown>>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), 5000);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

// ── fixtures ────────────────────────────────────────────────────────────────
async function setupBoardWithMember() {
  const owner = await registerUser({ name: 'Owner' });
  const member = await registerUser({ name: 'Member' });
  const outsider = await registerUser({ name: 'Outsider' });
  const board = await createBoard(owner, 'Rich Board');
  const teamId = board.teamId;
  await addTeamMember(teamId, member.id, 'MEMBER');
  const list = await createList(owner, board.id, 'Todo');
  const card = await createCard(owner, list.id, 'Rich card');
  return { owner, member, outsider, board, teamId, list, card };
}

// ── labels ──────────────────────────────────────────────────────────────────
describe('labels', () => {
  it('creates, renames and deletes labels as ADMIN; board payload stays in sync', async () => {
    const { owner, board } = await setupBoardWithMember();

    const created = await request(app)
      .post(`/api/boards/${board.id}/labels`)
      .set('Cookie', owner.cookie)
      .send({ name: 'Bug', color: '#ef4444' });
    expect(created.status).toBe(201);
    expect(created.body.label).toMatchObject({ name: 'Bug', color: '#ef4444' });
    const labelId = created.body.label.id;

    let payload = await request(app).get(`/api/boards/${board.id}`).set('Cookie', owner.cookie);
    expect(payload.body.labels.map((l: { name: string }) => l.name)).toContain('Bug');

    const renamed = await request(app)
      .patch(`/api/labels/${labelId}`)
      .set('Cookie', owner.cookie)
      .send({ name: 'Defect' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.label.name).toBe('Defect');

    const deleted = await request(app).delete(`/api/labels/${labelId}`).set('Cookie', owner.cookie);
    expect(deleted.status).toBe(204);

    payload = await request(app).get(`/api/boards/${board.id}`).set('Cookie', owner.cookie);
    expect(payload.body.labels).toHaveLength(0);
  });

  it('forbids MEMBER from managing labels (403) and hides them from non-members (404)', async () => {
    const { member, outsider, board } = await setupBoardWithMember();

    const asMember = await request(app)
      .post(`/api/boards/${board.id}/labels`)
      .set('Cookie', member.cookie)
      .send({ name: 'Nope' });
    expect(asMember.status).toBe(403);

    const asOutsider = await request(app)
      .post(`/api/boards/${board.id}/labels`)
      .set('Cookie', outsider.cookie)
      .send({ name: 'Nope' });
    expect(asOutsider.status).toBe(404);
  });

  it('attaches and detaches labels on cards; rejects duplicates and foreign labels', async () => {
    const { owner, board, card } = await setupBoardWithMember();

    const label = (
      await request(app)
        .post(`/api/boards/${board.id}/labels`)
        .set('Cookie', owner.cookie)
        .send({ name: 'Feature' })
    ).body.label;

    const attach = await request(app)
      .post(`/api/cards/${card.id}/labels`)
      .set('Cookie', owner.cookie)
      .send({ labelId: label.id });
    expect(attach.status).toBe(201);
    expect(attach.body.card.labels).toEqual([label]);

    const dup = await request(app)
      .post(`/api/cards/${card.id}/labels`)
      .set('Cookie', owner.cookie)
      .send({ labelId: label.id });
    expect(dup.status).toBe(409);

    // label from a different board
    const otherBoard = await createBoard(owner, 'Other');
    const foreign = (
      await request(app)
        .post(`/api/boards/${otherBoard.id}/labels`)
        .set('Cookie', owner.cookie)
        .send({ name: 'Other label' })
    ).body.label;
    const cross = await request(app)
      .post(`/api/cards/${card.id}/labels`)
      .set('Cookie', owner.cookie)
      .send({ labelId: foreign.id });
    expect(cross.status).toBe(404);

    const detach = await request(app)
      .delete(`/api/cards/${card.id}/labels/${label.id}`)
      .set('Cookie', owner.cookie);
    expect(detach.status).toBe(204);

    const detail = await request(app).get(`/api/cards/${card.id}`).set('Cookie', owner.cookie);
    expect(detail.body.card.labels).toEqual([]);
  });
});

// ── assignees ───────────────────────────────────────────────────────────────
describe('assignees', () => {
  it('assigns and unassigns team members; rejects duplicates and outsiders', async () => {
    const { owner, member, outsider, card } = await setupBoardWithMember();

    const assign = await request(app)
      .post(`/api/cards/${card.id}/assignees`)
      .set('Cookie', owner.cookie)
      .send({ userId: member.id });
    expect(assign.status).toBe(201);
    expect(assign.body.card.assignees).toEqual([
      expect.objectContaining({ id: member.id, name: 'Member' }),
    ]);

    const dup = await request(app)
      .post(`/api/cards/${card.id}/assignees`)
      .set('Cookie', owner.cookie)
      .send({ userId: member.id });
    expect(dup.status).toBe(409);

    const stranger = await request(app)
      .post(`/api/cards/${card.id}/assignees`)
      .set('Cookie', owner.cookie)
      .send({ userId: outsider.id });
    expect(stranger.status).toBe(404);

    const unassign = await request(app)
      .delete(`/api/cards/${card.id}/assignees/${member.id}`)
      .set('Cookie', owner.cookie);
    expect(unassign.status).toBe(204);

    const detail = await request(app).get(`/api/cards/${card.id}`).set('Cookie', owner.cookie);
    expect(detail.body.card.assignees).toEqual([]);

    // MEMBER can assign too
    const byMember = await request(app)
      .post(`/api/cards/${card.id}/assignees`)
      .set('Cookie', member.cookie)
      .send({ userId: member.id });
    expect(byMember.status).toBe(201);

    // non-member sees 404
    const byOutsider = await request(app)
      .post(`/api/cards/${card.id}/assignees`)
      .set('Cookie', outsider.cookie)
      .send({ userId: outsider.id });
    expect(byOutsider.status).toBe(404);
  });
});

// ── checklists ──────────────────────────────────────────────────────────────
describe('checklists', () => {
  it('creates checklists/items, toggles done, and returns them in card detail', async () => {
    const { owner, card } = await setupBoardWithMember();

    const cl = await request(app)
      .post(`/api/cards/${card.id}/checklists`)
      .set('Cookie', owner.cookie)
      .send({ title: 'Steps' });
    expect(cl.status).toBe(201);
    const checklistId = cl.body.checklist.id;

    const itemA = await request(app)
      .post(`/api/checklists/${checklistId}/items`)
      .set('Cookie', owner.cookie)
      .send({ text: 'First step' });
    expect(itemA.status).toBe(201);
    const itemB = await request(app)
      .post(`/api/checklists/${checklistId}/items`)
      .set('Cookie', owner.cookie)
      .send({ text: 'Second step' });
    expect(itemB.status).toBe(201);

    const toggled = await request(app)
      .patch(`/api/checklist-items/${itemA.body.item.id}`)
      .set('Cookie', owner.cookie)
      .send({ done: true });
    expect(toggled.status).toBe(200);
    expect(toggled.body.item.done).toBe(true);

    const detail = await request(app).get(`/api/cards/${card.id}`).set('Cookie', owner.cookie);
    expect(detail.body.card.checklists).toHaveLength(1);
    expect(detail.body.card.checklists[0]).toMatchObject({ title: 'Steps' });
    expect(detail.body.card.checklists[0].items.map((i: { done: boolean }) => i.done)).toEqual([
      true,
      false,
    ]);

    const delItem = await request(app)
      .delete(`/api/checklist-items/${itemB.body.item.id}`)
      .set('Cookie', owner.cookie);
    expect(delItem.status).toBe(204);

    const delCl = await request(app)
      .delete(`/api/checklists/${checklistId}`)
      .set('Cookie', owner.cookie);
    expect(delCl.status).toBe(204);

    const after = await request(app).get(`/api/cards/${card.id}`).set('Cookie', owner.cookie);
    expect(after.body.card.checklists).toEqual([]);
  });

  it('rejects empty checklist text with 400', async () => {
    const { owner, card } = await setupBoardWithMember();
    const res = await request(app)
      .post(`/api/cards/${card.id}/checklists`)
      .set('Cookie', owner.cookie)
      .send({ title: '   ' });
    expect(res.status).toBe(400);
  });

  it('hides checklists from non-members with 404', async () => {
    const { outsider, owner, card } = await setupBoardWithMember();
    const cl = await request(app)
      .post(`/api/cards/${card.id}/checklists`)
      .set('Cookie', owner.cookie)
      .send({ title: 'Secret' });
    const res = await request(app)
      .post(`/api/checklists/${cl.body.checklist.id}/items`)
      .set('Cookie', outsider.cookie)
      .send({ text: 'nope' });
    expect(res.status).toBe(404);
  });
});

// ── comments ────────────────────────────────────────────────────────────────
describe('comments', () => {
  it('posts and lists comments with the author attached', async () => {
    const { owner, member, card } = await setupBoardWithMember();

    const posted = await request(app)
      .post(`/api/cards/${card.id}/comments`)
      .set('Cookie', owner.cookie)
      .send({ body: 'Looks good' });
    expect(posted.status).toBe(201);
    expect(posted.body.comment).toMatchObject({
      body: 'Looks good',
      author: expect.objectContaining({ id: owner.id, name: 'Owner' }),
    });

    await request(app)
      .post(`/api/cards/${card.id}/comments`)
      .set('Cookie', member.cookie)
      .send({ body: 'One more thing' });

    const list = await request(app).get(`/api/cards/${card.id}/comments`).set('Cookie', member.cookie);
    expect(list.status).toBe(200);
    expect(list.body.comments).toHaveLength(2);
    expect(list.body.comments[0].body).toBe('Looks good');
  });

  it('only the author can edit; author or board admin can delete', async () => {
    const { owner, member, board, card } = await setupBoardWithMember();

    const mine = (
      await request(app)
        .post(`/api/cards/${card.id}/comments`)
        .set('Cookie', member.cookie)
        .send({ body: 'from member' })
    ).body.comment;

    // others cannot edit
    const editByOwner = await request(app)
      .patch(`/api/comments/${mine.id}`)
      .set('Cookie', owner.cookie)
      .send({ body: 'edited by owner' });
    expect(editByOwner.status).toBe(403);

    // author can edit
    const editByAuthor = await request(app)
      .patch(`/api/comments/${mine.id}`)
      .set('Cookie', member.cookie)
      .send({ body: 'edited by member' });
    expect(editByAuthor.status).toBe(200);
    expect(editByAuthor.body.comment.body).toBe('edited by member');

    // another MEMBER cannot delete
    const other = await registerUser({ name: 'Other Member' });
    await addTeamMember(board.teamId, other.id, 'MEMBER');
    const deleteByOther = await request(app)
      .delete(`/api/comments/${mine.id}`)
      .set('Cookie', other.cookie);
    expect(deleteByOther.status).toBe(403);

    // board OWNER (admin+) can delete someone else's comment
    const deleteByOwner = await request(app)
      .delete(`/api/comments/${mine.id}`)
      .set('Cookie', owner.cookie);
    expect(deleteByOwner.status).toBe(204);
  });

  it('rejects an empty comment body with 400', async () => {
    const { owner, card } = await setupBoardWithMember();
    const res = await request(app)
      .post(`/api/cards/${card.id}/comments`)
      .set('Cookie', owner.cookie)
      .send({ body: '' });
    expect(res.status).toBe(400);
  });
});

// ── card detail payload ─────────────────────────────────────────────────────
describe('GET /api/cards/:id', () => {
  it('returns labels, assignees, checklists, comments and activity together', async () => {
    const { owner, member, board, card } = await setupBoardWithMember();

    const label = (
      await request(app)
        .post(`/api/boards/${board.id}/labels`)
        .set('Cookie', owner.cookie)
        .send({ name: 'UI' })
    ).body.label;
    await request(app)
      .post(`/api/cards/${card.id}/labels`)
      .set('Cookie', owner.cookie)
      .send({ labelId: label.id });
    await request(app)
      .post(`/api/cards/${card.id}/assignees`)
      .set('Cookie', owner.cookie)
      .send({ userId: member.id });
    const cl = await request(app)
      .post(`/api/cards/${card.id}/checklists`)
      .set('Cookie', owner.cookie)
      .send({ title: 'QA' });
    await request(app)
      .post(`/api/checklists/${cl.body.checklist.id}/items`)
      .set('Cookie', owner.cookie)
      .send({ text: 'verify' });
    await request(app)
      .post(`/api/cards/${card.id}/comments`)
      .set('Cookie', owner.cookie)
      .send({ body: 'shipping it' });

    const res = await request(app).get(`/api/cards/${card.id}`).set('Cookie', owner.cookie);
    expect(res.status).toBe(200);
    expect(res.body.card.labels).toHaveLength(1);
    expect(res.body.card.assignees).toHaveLength(1);
    expect(res.body.card.checklists[0].items).toHaveLength(1);
    expect(res.body.card.comments).toHaveLength(1);
    expect(res.body.activity.length).toBeGreaterThanOrEqual(4); // created + 3 mutations
    expect(res.body.activity[0]).toHaveProperty('actor');
  });
});

// ── realtime ────────────────────────────────────────────────────────────────
describe('rich-task realtime', () => {
  it('emits label:created and label:deleted to the board room', async () => {
    const { owner, board } = await setupBoardWithMember();
    const socket = await connectClient(owner.cookie);
    expect(await joinRoom(socket, board.id)).toEqual({ ok: true });

    const createdPromise = waitForEvent<{ label: { id: string; name: string }; actorId: string }>(
      socket,
      'label:created'
    );
    const createRes = await request(app)
      .post(`/api/boards/${board.id}/labels`)
      .set('Cookie', owner.cookie)
      .set('x-client-event-id', 'evt-label-1')
      .send({ name: 'Urgent' });
    expect(createRes.status).toBe(201);

    const created = await createdPromise;
    expect(created.label.name).toBe('Urgent');
    expect(created.actorId).toBe(owner.id);

    const deletedPromise = waitForEvent<{ labelId: string }>(socket, 'label:deleted');
    await request(app)
      .delete(`/api/labels/${createRes.body.label.id}`)
      .set('Cookie', owner.cookie);
    const deleted = await deletedPromise;
    expect(deleted.labelId).toBe(createRes.body.label.id);
  });

  it('emits card:detail:changed for comments and checklist edits', async () => {
    const { owner, board, card } = await setupBoardWithMember();
    const socket = await connectClient(owner.cookie);
    expect(await joinRoom(socket, board.id)).toEqual({ ok: true });

    const detailPromise = waitForEvent<{ cardId: string }>(socket, 'card:detail:changed');
    await request(app)
      .post(`/api/cards/${card.id}/comments`)
      .set('Cookie', owner.cookie)
      .send({ body: 'ping' });
    const detail = await detailPromise;
    expect(detail.cardId).toBe(card.id);

    const cl = await request(app)
      .post(`/api/cards/${card.id}/checklists`)
      .set('Cookie', owner.cookie)
      .send({ title: 'Another' });
    const detailPromise2 = waitForEvent<{ cardId: string }>(socket, 'card:detail:changed');
    await request(app)
      .post(`/api/checklists/${cl.body.checklist.id}/items`)
      .set('Cookie', owner.cookie)
      .send({ text: 'item' });
    expect((await detailPromise2).cardId).toBe(card.id);
  });
});
