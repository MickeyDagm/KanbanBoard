import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/lib/prisma.js';
import { resetCodeStore } from '../src/lib/codeStore.js';
import { otpKey } from '../src/services/otpService.js';
import { app, cookieFrom, personalTeamId, resetDb } from './helpers.js';

const mocks = vi.hoisted(() => ({
  configured: true,
  sendOtpEmail: vi.fn(),
  sendInviteEmail: vi.fn(),
}));

vi.mock('../src/services/emailService.js', () => ({
  isEmailConfigured: () => mocks.configured,
  sendOtpEmail: (...args: unknown[]) => mocks.sendOtpEmail(...args),
  sendInviteEmail: (...args: unknown[]) => mocks.sendInviteEmail(...args),
}));

beforeEach(async () => {
  await resetDb();
  resetCodeStore();
  mocks.configured = true;
  mocks.sendOtpEmail.mockReset();
  mocks.sendOtpEmail.mockResolvedValue(undefined);
  mocks.sendInviteEmail.mockReset();
  mocks.sendInviteEmail.mockResolvedValue(undefined);
});

const payload = (email: string) => ({ email, password: 'password123', name: 'Nia' });

async function register(email: string) {
  const res = await request(app).post('/api/auth/register').send(payload(email));
  return res;
}

/** The code that would have gone out over SMTP (captured by the mock). */
function lastCode(call = -1): string {
  const calls = mocks.sendOtpEmail.mock.calls;
  const entry = calls.at(call);
  if (!entry) throw new Error('sendOtpEmail was never called');
  return (entry[0] as { code: string }).code;
}

describe('POST /api/auth/register (OTP on)', () => {
  it('creates the account unverified, sends a code and withholds the session', async () => {
    const res = await register('nia@example.com');

    expect(res.status).toBe(201);
    expect(res.body.requiresVerification).toBe(true);
    expect(res.headers['set-cookie']).toBeUndefined();

    const user = await prisma.user.findUnique({ where: { email: 'nia@example.com' } });
    expect(user?.emailVerifiedAt).toBeNull();

    expect(mocks.sendOtpEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendOtpEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'nia@example.com', purpose: 'verify', code: expect.stringMatching(/^\d{6}$/) })
    );

    // The Personal team still exists so they can use it after verifying.
    const team = await prisma.team.findFirst({ where: { createdById: user!.id } });
    expect(team?.name).toBe('Personal');
  });

  it('rolls the account back when the code cannot be emailed', async () => {
    mocks.sendOtpEmail.mockRejectedValue(new Error('SMTP down'));

    const res = await register('ghost@example.com');

    expect(res.status).toBe(502);
    expect(await prisma.user.findUnique({ where: { email: 'ghost@example.com' } })).toBeNull();
    expect(await prisma.team.count()).toBe(0);
  });

  it('keeps working without SMTP (no OTP step at all)', async () => {
    mocks.configured = false;

    const res = await register('plain@example.com');

    expect(res.status).toBe(201);
    expect(res.body.requiresVerification).toBeUndefined();
    expect(res.headers['set-cookie']).toBeDefined();
    expect(mocks.sendOtpEmail).not.toHaveBeenCalled();

    const user = await prisma.user.findUnique({ where: { email: 'plain@example.com' } });
    expect(user?.emailVerifiedAt).not.toBeNull();
  });
});

describe('POST /api/auth/verify-email', () => {
  it('signs the user in with the correct code', async () => {
    await register('check@example.com');
    const code = lastCode();

    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({ email: 'check@example.com', code });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'check@example.com' });
    expect(res.headers['set-cookie']).toBeDefined();

    const user = await prisma.user.findUnique({ where: { email: 'check@example.com' } });
    expect(user?.emailVerifiedAt).not.toBeNull();

    // Code is single use.
    const again = await request(app)
      .post('/api/auth/verify-email')
      .send({ email: 'check@example.com', code });
    expect(again.status).toBe(400);
    expect(again.body.error.message).toMatch(/already verified/i);
  });

  it('rejects wrong codes and burns the code after too many attempts', async () => {
    await register('brute@example.com');
    const real = lastCode();
    const wrong = real === '000000' ? '111111' : '000000';

    const guesses: request.Response[] = [];
    for (let i = 0; i < 5; i += 1) {
      guesses.push(
        await request(app)
          .post('/api/auth/verify-email')
          .send({ email: 'brute@example.com', code: wrong })
      );
    }
    expect(guesses[0].status).toBe(400);
    expect(guesses[0].body.error.message).toMatch(/invalid/i);
    expect(guesses.at(-1)!.body.error.message).toMatch(/too many wrong attempts/i);

    // Budget spent — even the real code no longer works.
    const dead = await request(app)
      .post('/api/auth/verify-email')
      .send({ email: 'brute@example.com', code: real });
    expect(dead.status).toBe(400);
    expect(dead.body.error.message).toMatch(/invalid/i);

    const user = await prisma.user.findUnique({ where: { email: 'brute@example.com' } });
    expect(user?.emailVerifiedAt).toBeNull();
  });

  it('400s for unknown addresses', async () => {
    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({ email: 'nobody@example.com', code: '123456' });
    expect(res.status).toBe(400);
  });

  it('validates the code format', async () => {
    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({ email: 'nia@example.com', code: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error.issues?.[0]?.message).toMatch(/6-digit/i);
  });
});

describe('POST /api/auth/resend-verification', () => {
  it('issues a fresh code and throttles repeat requests', async () => {
    await register('throttle@example.com');
    const firstCode = lastCode();

    for (let i = 0; i < 2; i += 1) {
      const ok = await request(app)
        .post('/api/auth/resend-verification')
        .send({ email: 'throttle@example.com' });
      expect(ok.status).toBe(202);
    }

    const limited = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'throttle@example.com' });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');

    // The newest code replaced the first one.
    const newest = lastCode();
    expect(newest).not.toBe(firstCode);
    const verify = await request(app)
      .post('/api/auth/verify-email')
      .send({ email: 'throttle@example.com', code: newest });
    expect(verify.status).toBe(200);
  });

  it('is a silent no-op for unknown or already verified addresses', async () => {
    const unknown = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'stranger@example.com' });
    expect(unknown.status).toBe(202);
    expect(mocks.sendOtpEmail).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/login (unverified)', () => {
  it('blocks sign-in until the address is verified and resends the code', async () => {
    await register('late@example.com');

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'late@example.com', password: 'password123' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(mocks.sendOtpEmail).toHaveBeenCalledTimes(2);

    const code = lastCode();
    await request(app)
      .post('/api/auth/verify-email')
      .send({ email: 'late@example.com', code });

    const ok = await request(app)
      .post('/api/auth/login')
      .send({ email: 'late@example.com', password: 'password123' });
    expect(ok.status).toBe(200);
    expect(ok.headers['set-cookie']).toBeDefined();
  });

  it('still rejects a wrong password', async () => {
    await register('late2@example.com');
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'late2@example.com', password: 'nope-password' });
    expect(res.status).toBe(401);
  });
});

describe('password reset (forgot / reset)', () => {
  it('503s when outbound email is off', async () => {
    mocks.configured = false;
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'someone@example.com' });
    expect(res.status).toBe(503);
    expect(res.body.error.message).toMatch(/SMTP_HOST/);
  });

  it('emails a reset code without revealing whether the account exists', async () => {
    await register('resetme@example.com');
    mocks.sendOtpEmail.mockClear();

    const unknown = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.com' });
    expect(unknown.status).toBe(202);
    expect(mocks.sendOtpEmail).not.toHaveBeenCalled();

    const known = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'resetme@example.com' });
    expect(known.status).toBe(202);
    expect(mocks.sendOtpEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'resetme@example.com', purpose: 'reset' })
    );
  });

  it('sets a new password with the code and only allows it once', async () => {
    await register('changeit@example.com');
    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'changeit@example.com' });
    const code = lastCode();

    const wrong = await request(app)
      .post('/api/auth/reset-password')
      .send({ email: 'changeit@example.com', code: '999999', password: 'brandnewpass1' });
    expect(wrong.status).toBe(400);

    const ok = await request(app)
      .post('/api/auth/reset-password')
      .send({ email: 'changeit@example.com', code, password: 'brandnewpass1' });
    expect(ok.status).toBe(200);

    const oldPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'changeit@example.com', password: 'password123' });
    expect(oldPassword.status).toBe(401);

    const newPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'changeit@example.com', password: 'brandnewpass1' });
    expect(newPassword.status).toBe(200);

    // The code was consumed.
    const reused = await request(app)
      .post('/api/auth/reset-password')
      .send({ email: 'changeit@example.com', code, password: 'anotherpass12' });
    expect(reused.status).toBe(400);
  });

  it('rejects a code issued for a different purpose', async () => {
    await register('cross@example.com');
    const verifyCode = lastCode();

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ email: 'cross@example.com', code: verifyCode, password: 'brandnewpass1' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/invalid|expired/i);
  });
});

describe('invite → register → verify → join', () => {
  it('lands the invited friend in the team after the OTP step', async () => {
    await register('owner@example.com');
    const ownerCode = lastCode();
    const verified = await request(app)
      .post('/api/auth/verify-email')
      .send({ email: 'owner@example.com', code: ownerCode });
    const ownerCookie = cookieFrom(verified);

    const teamId = await personalTeamId(verified.body.user.id);

    const invite = await request(app)
      .post(`/api/teams/${teamId}/invites`)
      .set('Cookie', ownerCookie)
      .send({ role: 'MEMBER' });
    expect(invite.status).toBe(201);
    expect(mocks.sendInviteEmail).not.toHaveBeenCalled();

    // The friend follows /invite/:code → signs up → must verify first.
    const friend = await register('friend@example.com');
    expect(friend.body.requiresVerification).toBe(true);

    const friendCookie = cookieFrom(
      await request(app)
        .post('/api/auth/verify-email')
        .send({ email: 'friend@example.com', code: lastCode() })
    );

    const preview = await request(app)
      .get(`/api/invites/${invite.body.invite.code}`)
      .set('Cookie', friendCookie);
    expect(preview.status).toBe(200);
    expect(preview.body.alreadyMember).toBe(false);

    const join = await request(app)
      .post(`/api/invites/${invite.body.invite.code}/redeem`)
      .set('Cookie', friendCookie);
    expect(join.status).toBe(200);
    expect(join.body).toMatchObject({ role: 'MEMBER', joined: true });
  });
});

describe('otp service storage', () => {
  it('stores the code under otp:<purpose>:<email>', async () => {
    await register('stored@example.com');
    const raw = await (await import('../src/lib/codeStore.js'))
      .getCodeStore()
      .get(otpKey('verify', 'stored@example.com'));
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).code).toBe(lastCode());
  });
});
