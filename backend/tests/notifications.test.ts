import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { closeSocket, initSocket } from '../src/realtime/socket.js';
import { prisma } from '../src/lib/prisma.js';
import { sweepDueSoon } from '../src/services/notificationService.js';
import {
  addTeamMember,
  app,
  createBoard,
  createCard,
  createList,
  personalTeamId,
  registerUser,
  resetDb,
  type TestUser,
} from './helpers.js';

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

function waitForEvent<T = Record<string, unknown>>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), 5000);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** Owner creates board+list+card and adds `member` to the team. */
async function seedCard(owner: TestUser, member?: TestUser) {
  const board = await createBoard(owner);
  const teamId = board.teamId;
  const list = await createList(owner, board.id, 'Todo');
  const card = await createCard(owner, list.id, 'Ship Phase 7');
  if (member) await addTeamMember(teamId, member.id, 'MEMBER');
  return { board, teamId, list, card };
}

function listNotifications(user: TestUser, query = '') {
  return request(app).get(`/api/notifications${query}`).set('Cookie', user.cookie);
}

describe('notification generation', () => {
  it('creates an ASSIGNED notification when someone assigns you (never for self-assign)', async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const { board, card } = await seedCard(owner, member);

    const assign = await request(app)
      .post(`/api/cards/${card.id}/assignees`)
      .set('Cookie', owner.cookie)
      .send({ userId: member.id });
    expect(assign.status).toBe(201);

    const res = await listNotifications(member);
    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(1);
    const [n] = res.body.notifications;
    expect(n.type).toBe('ASSIGNED');
    expect(n.actor.id).toBe(owner.id);
    expect(n.card.id).toBe(card.id);
    expect(n.board.id).toBe(board.id);
    expect(n.readAt).toBeNull();

    // Self-assign → no notification.
    await request(app)
      .post(`/api/cards/${card.id}/assignees`)
      .set('Cookie', owner.cookie)
      .send({ userId: owner.id });
    const ownerRes = await listNotifications(owner);
    expect(ownerRes.body.unreadCount).toBe(0);
  });

  it('notifies assignees and the card creator on comment, but not the author', async () => {
    const owner = await registerUser();
    const assignee = await registerUser();
    const { card } = await seedCard(owner, assignee);

    await request(app)
      .post(`/api/cards/${card.id}/assignees`)
      .set('Cookie', owner.cookie)
      .send({ userId: assignee.id });

    // assignee comments → owner (creator) notified, assignee not (is author).
    const comment = await request(app)
      .post(`/api/cards/${card.id}/comments`)
      .set('Cookie', assignee.cookie)
      .send({ body: 'looks good to me' });
    expect(comment.status).toBe(201);

    const ownerRes = await listNotifications(owner);
    expect(ownerRes.body.notifications[0].type).toBe('COMMENTED');
    const assigneeRes = await listNotifications(assignee);
    // only the earlier ASSIGNED notification, no COMMENTED about own comment
    expect(assigneeRes.body.notifications).toHaveLength(1);
    expect(assigneeRes.body.notifications[0].type).toBe('ASSIGNED');
  });

  it('parses @mentions by name, email and local-part → MENTIONED, excluded from COMMENTED', async () => {
    const owner = await registerUser({ name: 'Alice Wonder' });
    const mentioned = await registerUser({ email: 'bob.dev@x.local', name: 'Bob Builder' });
    const assignee = await registerUser({ email: 'carol@x.local', name: 'Carol' });
    const { card } = await seedCard(owner, assignee);
    // add mentioned to owner's personal team
    await addTeamMember(await personalTeamId(owner.id), mentioned.id, 'MEMBER');
    await request(app)
      .post(`/api/cards/${card.id}/assignees`)
      .set('Cookie', owner.cookie)
      .send({ userId: assignee.id });

    // mention by full name and by email local-part; assignee in same comment.
    const res = await request(app)
      .post(`/api/cards/${card.id}/comments`)
      .set('Cookie', owner.cookie)
      .send({ body: 'hey @Alice Wonder and @carol — please review @bob.dev' });
    expect(res.status).toBe(201);

    const mentionedRes = await listNotifications(mentioned);
    expect(mentionedRes.body.notifications).toHaveLength(1);
    expect(mentionedRes.body.notifications[0].type).toBe('MENTIONED');

    // assignee (Carol) was mentioned too → MENTIONED, not a second COMMENTED.
    const carolRes = await listNotifications(assignee);
    const carolTypes = carolRes.body.notifications.map((n: { type: string }) => n.type);
    expect(carolTypes.filter((t: string) => t === 'MENTIONED')).toHaveLength(1);
    expect(carolTypes.filter((t: string) => t === 'COMMENTED')).toHaveLength(0);
  });

  it('notifies team OWNER/ADMIN (not MEMBERs) when someone redeems an invite', async () => {
    const owner = await registerUser();
    const admin = await registerUser();
    const member = await registerUser();
    const joiner = await registerUser();
    const teamId = await personalTeamId(owner.id);
    await addTeamMember(teamId, admin.id, 'ADMIN');
    await addTeamMember(teamId, member.id, 'MEMBER');

    const inviteRes = await request(app)
      .post(`/api/teams/${teamId}/invites`)
      .set('Cookie', owner.cookie)
      .send({ role: 'MEMBER' });
    expect(inviteRes.status).toBe(201);
    const code = inviteRes.body.invite.code;

    const redeem = await request(app)
      .post(`/api/invites/${code}/redeem`)
      .set('Cookie', joiner.cookie);
    expect(redeem.status).toBe(200);
    expect(redeem.body.joined).toBe(true);

    for (const user of [owner, admin]) {
      const res = await listNotifications(user);
      expect(res.body.notifications[0].type).toBe('INVITE_REDEEMED');
      expect(res.body.notifications[0].actor.id).toBe(joiner.id);
      expect(res.body.notifications[0].team.id).toBe(teamId);
    }
    const memberRes = await listNotifications(member);
    expect(memberRes.body.unreadCount).toBe(0);

    // joiner themselves get nothing.
    const joinerRes = await listNotifications(joiner);
    expect(joinerRes.body.notifications).toHaveLength(0);
  });
});

describe('GET /api/notifications', () => {
  it('returns only own notifications, supports ?unread=1 and unreadCount', async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const { card } = await seedCard(owner, member);

    await request(app)
      .post(`/api/cards/${card.id}/assignees`)
      .set('Cookie', owner.cookie)
      .send({ userId: member.id });

    const mine = await listNotifications(member);
    expect(mine.status).toBe(200);
    expect(mine.body.notifications).toHaveLength(1);
    expect(mine.body.unreadCount).toBe(1);

    const unread = await listNotifications(member, '?unread=1');
    expect(unread.body.notifications).toHaveLength(1);

    const other = await listNotifications(owner);
    expect(other.body.notifications).toHaveLength(0);
    expect(other.body.unreadCount).toBe(0);

    const afterReadAll = await request(app)
      .post('/api/notifications/read-all')
      .set('Cookie', member.cookie);
    expect(afterReadAll.status).toBe(200);
    expect(afterReadAll.body.updated).toBe(1);

    const empty = await listNotifications(member, '?unread=1');
    expect(empty.body.notifications).toHaveLength(0);
    expect(empty.body.unreadCount).toBe(0);
  });
});

describe('POST /api/notifications/:id/read', () => {
  it('marks own notification read, hides other users with 404', async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const { card } = await seedCard(owner, member);
    await request(app)
      .post(`/api/cards/${card.id}/assignees`)
      .set('Cookie', owner.cookie)
      .send({ userId: member.id });

    const list = await listNotifications(member);
    const id = list.body.notifications[0].id;

    // owner (not recipient) → 404
    const forbidden = await request(app)
      .post(`/api/notifications/${id}/read`)
      .set('Cookie', owner.cookie);
    expect(forbidden.status).toBe(404);

    const read = await request(app)
      .post(`/api/notifications/${id}/read`)
      .set('Cookie', member.cookie);
    expect(read.status).toBe(200);
    expect(read.body.notification.readAt).not.toBeNull();

    const after = await listNotifications(member);
    expect(after.body.unreadCount).toBe(0);
    expect(after.body.notifications[0].readAt).not.toBeNull();
  });
});

describe('realtime: notification:new', () => {
  it('pushes to the recipient personal room live', async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const { card } = await seedCard(owner, member);

    const socket = await connectClient(member.cookie);
    const wait = waitForEvent<{ type: string; notification: { type: string; card: { id: string } } }>(
      socket,
      'notification:new'
    );

    await request(app)
      .post(`/api/cards/${card.id}/assignees`)
      .set('Cookie', owner.cookie)
      .send({ userId: member.id });

    const payload = await wait;
    expect(payload.notification.type).toBe('ASSIGNED');
    expect(payload.notification.card.id).toBe(card.id);
  });

  it('does not push other users notifications into a room', async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const { card } = await seedCard(owner, member);

    const strangerSocket = await connectClient(owner.cookie);
    let got = false;
    strangerSocket.on('notification:new', () => {
      got = true;
    });

    await request(app)
      .post(`/api/cards/${card.id}/assignees`)
      .set('Cookie', owner.cookie)
      .send({ userId: member.id });
    await listNotifications(member); // ensure delivery attempt settled

    await new Promise((r) => setTimeout(r, 150));
    expect(got).toBe(false);
  });
});

describe('DUE_SOON sweeper', () => {
  it('creates one due-soon notification per assignee within the 24h window and dedupes', async () => {
    const owner = await registerUser();
    const assignee = await registerUser();
    const { list, card } = await seedCard(owner, assignee);
    await request(app)
      .post(`/api/cards/${card.id}/assignees`)
      .set('Cookie', owner.cookie)
      .send({ userId: assignee.id });

    // due in 6 hours
    await request(app)
      .patch(`/api/cards/${card.id}`)
      .set('Cookie', owner.cookie)
      .send({ dueDate: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString() });

    const created = await sweepDueSoon();
    expect(created).toBe(1);

    const res = await listNotifications(assignee);
    const due = res.body.notifications.filter((n: { type: string }) => n.type === 'DUE_SOON');
    expect(due).toHaveLength(1);
    expect(due[0].card.id).toBe(card.id);
    expect(due[0].board.id).toBeTruthy();

    // second sweep inside the dedupe window → no duplicates
    const again = await sweepDueSoon();
    expect(again).toBe(0);

    // far-future due date → sweep skips (not within 24h) for a fresh card
    const far = await createCard(owner, list.id, 'Later');
    await request(app)
      .patch(`/api/cards/${far.id}`)
      .set('Cookie', owner.cookie)
      .send({ dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() });
    await prisma.cardAssignee.create({ data: { cardId: far.id, userId: assignee.id } });
    const third = await sweepDueSoon();
    expect(third).toBe(0);
  });
});
