import request from 'supertest';
import { LoginMethod } from '@prisma/client';
import { createTestApp, TestContext } from './utils/app.factory';
import { STRONG_PASSWORD, createAccount, createUser, loginAs } from './utils/auth';

const NEW_PASSWORD = 'FreshPass9!';

describe('Auth (e2e)', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  describe('registration + email verification', () => {
    it('registers, blocks login until verified, then verifies by code and logs in', async () => {
      const email = 'newuser@example.com';

      await http()
        .post('/api/auth/register')
        .send({ email, password: STRONG_PASSWORD })
        .expect(201);

      // The verification email carries the code (captured by the fake mailer).
      const code = ctx.email.verificationCode(email);
      expect(code).toBeDefined();

      // Login is hard-gated on email verification.
      await http().post('/api/auth/login').send({ email, password: STRONG_PASSWORD }).expect(401);

      await http().post('/api/auth/verify-email/code').send({ email, code }).expect(200);

      const res = await http()
        .post('/api/auth/login')
        .send({ email, password: STRONG_PASSWORD })
        .expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user.email).toBe(email);
    });

    it('verifies by link token as well', async () => {
      const email = 'linkverify@example.com';
      await http()
        .post('/api/auth/register')
        .send({ email, password: STRONG_PASSWORD })
        .expect(201);
      const link = ctx.email.verificationLink(email);
      expect(link).toBeDefined();
      const token = new URL(link as string).searchParams.get('token') ?? (link as string);

      await http().post('/api/auth/verify-email/link').send({ token }).expect(200);
      await loginAs(ctx.app, email);
    });

    it('rejects a duplicate email with 409', async () => {
      const email = 'dupe@example.com';
      await http()
        .post('/api/auth/register')
        .send({ email, password: STRONG_PASSWORD })
        .expect(201);
      await http()
        .post('/api/auth/register')
        .send({ email, password: STRONG_PASSWORD })
        .expect(409);
    });

    it('rejects a weak password with 400', async () => {
      await http()
        .post('/api/auth/register')
        .send({ email: 'weak@example.com', password: 'weak' })
        .expect(400);
    });
  });

  describe('session lifecycle', () => {
    it('returns the current user from /auth/me with a bearer token', async () => {
      await createUser(ctx.prisma, 'me@example.com');
      const { accessToken } = await loginAs(ctx.app, 'me@example.com');

      const res = await http()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.email).toBe('me@example.com');
      expect(res.body.permissions).toEqual(expect.arrayContaining(['profile:read:own']));
    });

    it('rejects /auth/me without a token', async () => {
      await http().get('/api/auth/me').expect(401);
    });

    it('rotates the refresh token and issues a new access token', async () => {
      await createUser(ctx.prisma, 'refresh@example.com');
      const { refreshCookie } = await loginAs(ctx.app, 'refresh@example.com');
      expect(refreshCookie).toBeDefined();

      const res = await http()
        .post('/api/auth/refresh')
        .set('Cookie', refreshCookie as string)
        .expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it('rejects refresh without the cookie', async () => {
      await http().post('/api/auth/refresh').expect(400);
    });

    it('logs out and revokes the session', async () => {
      await createUser(ctx.prisma, 'logout@example.com');
      const { accessToken, refreshCookie } = await loginAs(ctx.app, 'logout@example.com');

      await http()
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', refreshCookie as string)
        .expect(200);

      // The revoked refresh token can no longer be rotated.
      await http()
        .post('/api/auth/refresh')
        .set('Cookie', refreshCookie as string)
        .expect((res) => {
          expect([400, 401]).toContain(res.status);
        });
    });
  });

  describe('change password', () => {
    it('changes the password and invalidates the old one', async () => {
      await createUser(ctx.prisma, 'changepw@example.com');
      const { accessToken } = await loginAs(ctx.app, 'changepw@example.com');

      await http()
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: STRONG_PASSWORD, newPassword: NEW_PASSWORD })
        .expect(200);

      await http()
        .post('/api/auth/login')
        .send({ email: 'changepw@example.com', password: STRONG_PASSWORD })
        .expect(401);
      await loginAs(ctx.app, 'changepw@example.com', NEW_PASSWORD);
    });

    it('rejects change-password with a wrong current password', async () => {
      await createUser(ctx.prisma, 'wrongpw@example.com');
      const { accessToken } = await loginAs(ctx.app, 'wrongpw@example.com');
      await http()
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'NotThePass9!', newPassword: NEW_PASSWORD })
        .expect((res) => {
          expect([400, 401]).toContain(res.status);
        });
    });
  });

  describe('OTP login', () => {
    it('issues and verifies a one-time sign-in code', async () => {
      const email = 'otp@example.com';
      await createAccount(ctx.prisma, {
        email,
        roleName: 'USER',
        loginMethod: LoginMethod.BOTH,
      });

      await http().post('/api/auth/login/request-otp').send({ email }).expect(200);
      const code = ctx.email.otpCode(email);
      expect(code).toBeDefined();

      const res = await http().post('/api/auth/login/verify-otp').send({ email, code }).expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it('stays silent (200) for an OTP request to an unknown email', async () => {
      await http()
        .post('/api/auth/login/request-otp')
        .send({ email: 'nobody@example.com' })
        .expect(200);
      expect(ctx.email.otpCode('nobody@example.com')).toBeUndefined();
    });
  });

  describe('password reset', () => {
    it('resets the password via the emailed token', async () => {
      const email = 'reset@example.com';
      await createUser(ctx.prisma, email);

      await http().post('/api/auth/request-password-reset').send({ email }).expect(200);
      const token = ctx.email.resetToken(email);
      expect(token).toBeDefined();

      await http()
        .post('/api/auth/reset-password')
        .send({ token, newPassword: NEW_PASSWORD })
        .expect(200);

      await loginAs(ctx.app, email, NEW_PASSWORD);
    });

    it('stays silent (200) for a reset request to an unknown email (no enumeration)', async () => {
      await http()
        .post('/api/auth/request-password-reset')
        .send({ email: 'ghost@example.com' })
        .expect(200);
      expect(ctx.email.resetToken('ghost@example.com')).toBeUndefined();
    });
  });

  describe('brute-force lockout', () => {
    it('locks the account after repeated failed logins', async () => {
      const email = 'lockme@example.com';
      await createUser(ctx.prisma, email);

      for (let i = 0; i < 5; i++) {
        await http().post('/api/auth/login').send({ email, password: 'WrongPass9!' }).expect(401);
      }

      // Even the correct password is now refused while the lockout holds.
      const res = await http()
        .post('/api/auth/login')
        .send({ email, password: STRONG_PASSWORD })
        .expect(401);
      expect(JSON.stringify(res.body)).toMatch(/lock/i);
    });
  });
});
