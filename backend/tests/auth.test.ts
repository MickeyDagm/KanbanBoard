import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, cookieFrom, resetDb } from './helpers.js';
import { prisma } from '../src/lib/prisma.js';

beforeEach(async () => {
  await resetDb();
});

describe('POST /api/auth/register', () => {
  it('creates a user, a Personal team (OWNER) and sets an auth cookie', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'alice@example.com',
      password: 'password123',
      name: 'Alice',
    });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'alice@example.com', name: 'Alice' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.headers['set-cookie']).toBeDefined();

    const user = await prisma.user.findUnique({ where: { email: 'alice@example.com' } });
    expect(user).not.toBeNull();

    const team = await prisma.team.findFirst({ where: { name: 'Personal', createdById: user!.id } });
    expect(team).not.toBeNull();

    const membership = await prisma.teamMember.findFirst({
      where: { teamId: team!.id, userId: user!.id },
    });
    expect(membership?.role).toBe('OWNER');
  });

  it('rejects duplicate emails with 409', async () => {
    const payload = { email: 'dup@example.com', password: 'password123', name: 'Dup' };
    expect((await request(app).post('/api/auth/register').send(payload)).status).toBe(201);

    const res = await request(app).post('/api/auth/register').send(payload);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects weak passwords and invalid emails with 400', async () => {
    const weak = await request(app)
      .post('/api/auth/register')
      .send({ email: 'weak@example.com', password: 'short', name: 'Weak' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');

    const badEmail = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'password123', name: 'X' });
    expect(badEmail.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials and rejects wrong ones', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'bob@example.com', password: 'password123', name: 'Bob' });

    const ok = await request(app)
      .post('/api/auth/login')
      .send({ email: 'bob@example.com', password: 'password123' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe('bob@example.com');
    cookieFrom(ok);

    const bad = await request(app)
      .post('/api/auth/login')
      .send({ email: 'bob@example.com', password: 'wrong-password' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('GET /api/auth/me', () => {
  it('returns the current user when authenticated', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'carol@example.com',
      password: 'password123',
      name: 'Carol',
    });
    const cookie = cookieFrom(res);

    const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ email: 'carol@example.com', name: 'Carol' });
  });

  it('returns 401 without a cookie', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with a garbage cookie', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'kanban_token=not-a-jwt');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the auth cookie', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'dave@example.com',
      password: 'password123',
      name: 'Dave',
    });
    const cookie = cookieFrom(reg);

    const out = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(200);
    // JWTs are stateless — logout only expires the cookie in the browser
    expect(String(out.headers['set-cookie'])).toContain(`${'kanban_token'}=;`);
  });
});
