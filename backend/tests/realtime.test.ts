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

function joinRoom(socket: ClientSocket, room: 'board:join' | 'team:join', id: string) {
  return new Promise<{ ok: boolean; error?: string }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('join ack timeout')), 5000);
    socket.emit(room, id, (res: { ok: boolean; error?: string }) => {
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

describe('socket realtime', () => {
  it('rejects unauthenticated connections', async () => {
    await expect(connectClient()).rejects.toThrow(/unauthorized/i);
  });

  it('delivers list:created to board members with actorId + clientEventId envelope', async () => {
    const user = await registerUser();
    const board = await createBoard(user);

    const socket = await connectClient(user.cookie);
    expect(await joinRoom(socket, 'board:join', board.id)).toEqual({ ok: true });

    const eventPromise = waitForEvent<{
      list: { id: string; title: string };
      actorId: string;
      clientEventId?: string;
    }>(socket, 'list:created');

    const res = await request(app)
      .post(`/api/boards/${board.id}/lists`)
      .set('Cookie', user.cookie)
      .set('x-client-event-id', 'evt-abc-123')
      .send({ title: 'Realtime List' });
    expect(res.status).toBe(201);

    const event = await eventPromise;
    expect(event.list.title).toBe('Realtime List');
    expect(event.actorId).toBe(user.id);
    expect(event.clientEventId).toBe('evt-abc-123');
  });

  it('sends card:moved with from/to list and final index', async () => {
    const user = await registerUser();
    const board = await createBoard(user);
    const list1 = await createList(user, board.id, 'List A');
    const list2 = await createList(user, board.id, 'List B');
    const card = await createCard(user, list1.id, 'Movable card');

    const socket = await connectClient(user.cookie);
    expect(await joinRoom(socket, 'board:join', board.id)).toEqual({ ok: true });

    const eventPromise = waitForEvent<{
      card: { id: string; listId: string; position: number };
      fromListId: string;
      toListId: string;
      index: number;
    }>(socket, 'card:moved');

    const res = await request(app)
      .post(`/api/cards/${card.id}/move`)
      .set('Cookie', user.cookie)
      .set('x-client-event-id', 'evt-move-1')
      .send({ listId: list2.id, index: 0 });
    expect(res.status).toBe(200);

    const event = await eventPromise;
    expect(event.card.id).toBe(card.id);
    expect(event.card.listId).toBe(list2.id);
    expect(event.fromListId).toBe(list1.id);
    expect(event.toListId).toBe(list2.id);
    expect(event.index).toBe(0);
    expect(event.card.position).toBe(0);
  });

  it('denies board:join to non-members without leaking existence', async () => {
    const owner = await registerUser();
    const outsider = await registerUser();
    const board = await createBoard(owner);

    const socket = await connectClient(outsider.cookie);
    const res = await joinRoom(socket, 'board:join', board.id);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Board not found');
  });

  it('broadcasts board events to the team room for all members', async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const teamId = await (async () => {
      const b = await createBoard(owner);
      await addTeamMember(b.teamId, member.id, 'MEMBER');
      return b.teamId;
    })();

    const ownerSocket = await connectClient(owner.cookie);
    const memberSocket = await connectClient(member.cookie);
    expect(await joinRoom(ownerSocket, 'team:join', teamId)).toEqual({ ok: true });
    expect(await joinRoom(memberSocket, 'team:join', teamId)).toEqual({ ok: true });

    const memberEvent = waitForEvent<{ board: { title: string }; actorId: string }>(
      memberSocket,
      'board:created'
    );

    const res = await request(app)
      .post('/api/boards')
      .set('Cookie', owner.cookie)
      .set('x-client-event-id', 'evt-board-1')
      .send({ teamId, title: 'Team Board' });
    expect(res.status).toBe(201);

    const event = await memberEvent;
    expect(event.board.title).toBe('Team Board');
    expect(event.actorId).toBe(owner.id);
  });

  it('does not deliver board events to users outside the team', async () => {
    const owner = await registerUser();
    const outsider = await registerUser();
    const board = await createBoard(owner);

    const outsiderSocket = await connectClient(outsider.cookie);
    expect(await joinRoom(outsiderSocket, 'team:join', board.teamId)).toMatchObject({ ok: false });

    let received = false;
    outsiderSocket.on('board:created', () => {
      received = true;
    });

    await request(app)
      .post('/api/boards')
      .set('Cookie', owner.cookie)
      .send({ teamId: board.teamId, title: 'Secret' });

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(received).toBe(false);
  });
});
