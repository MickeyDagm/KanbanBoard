import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { getCodeStore } from '../src/lib/codeStore.js';
import { otpKey } from '../src/services/otpService.js';

export const app = createApp();

const ALL_TABLES = [
  '"User"',
  '"Team"',
  '"TeamMember"',
  '"Invite"',
  '"Board"',
  '"List"',
  '"Card"',
  '"Label"',
  '"CardLabel"',
  '"CardAssignee"',
  '"Checklist"',
  '"ChecklistItem"',
  '"Comment"',
  '"Activity"',
  '"Notification"',
].join(', ');

export async function resetDb() {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${ALL_TABLES} RESTART IDENTITY CASCADE`);
}

export function cookieFrom(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (!header) throw new Error('Expected set-cookie header');
  return header.split(';')[0];
}

export interface TestUser {
  id: string;
  email: string;
  cookie: string;
}

let userCounter = 0;

export async function registerUser(overrides?: { email?: string; name?: string }): Promise<TestUser> {
  userCounter += 1;
  const email = overrides?.email ?? `user${userCounter}-${Date.now()}@test.local`;
  const res = await request(app).post('/api/auth/register').send({
    email,
    password: 'password123',
    name: overrides?.name ?? `Test User ${userCounter}`,
  });
  if (res.status !== 201) {
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  // Suites that turn outbound email on make registration wait for an OTP —
  // read the code straight from the store so the helper can finish the job.
  if (res.body.requiresVerification) {
    const raw = await getCodeStore().get(otpKey('verify', email));
    const code = raw ? (JSON.parse(raw).code as string) : null;
    if (!code) throw new Error('register required verification but no OTP was stored');
    const verified = await request(app)
      .post('/api/auth/verify-email')
      .send({ email, code });
    if (verified.status !== 200) {
      throw new Error(`verify failed: ${verified.status} ${JSON.stringify(verified.body)}`);
    }
    return { id: res.body.user.id, email, cookie: cookieFrom(verified) };
  }

  return { id: res.body.user.id, email, cookie: cookieFrom(res) };
}

/** The auto-created "Personal" team of a freshly registered user. */
export async function personalTeamId(userId: string): Promise<string> {
  const membership = await prisma.teamMember.findFirst({
    where: { userId, team: { name: 'Personal' } },
  });
  if (!membership) throw new Error('Personal team not found for user');
  return membership.teamId;
}

export async function createBoard(user: TestUser, title = 'Test Board') {
  const teamId = await personalTeamId(user.id);
  const res = await request(app)
    .post('/api/boards')
    .set('Cookie', user.cookie)
    .send({ teamId, title });
  if (res.status !== 201) {
    throw new Error(`createBoard failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.board as { id: string; title: string; teamId: string };
}

export async function createList(user: TestUser, boardId: string, title: string) {
  const res = await request(app)
    .post(`/api/boards/${boardId}/lists`)
    .set('Cookie', user.cookie)
    .send({ title });
  if (res.status !== 201) {
    throw new Error(`createList failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.list as { id: string; title: string; position: number };
}

export async function createCard(user: TestUser, listId: string, title: string) {
  const res = await request(app)
    .post(`/api/lists/${listId}/cards`)
    .set('Cookie', user.cookie)
    .send({ title });
  if (res.status !== 201) {
    throw new Error(`createCard failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.card as { id: string; title: string; position: number; listId: string };
}

/** Add a user to a team with a given role (directly via prisma — invites are Phase 5). */
export async function addTeamMember(teamId: string, userId: string, role: 'OWNER' | 'ADMIN' | 'MEMBER') {
  return prisma.teamMember.create({ data: { teamId, userId, role } });
}
