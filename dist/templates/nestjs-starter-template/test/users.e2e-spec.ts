import request from 'supertest';
import { createTestApp, TestContext } from './utils/app.factory';
import { createSuperAdmin, createUser, loginAs } from './utils/auth';

describe('Users (e2e)', () => {
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

  describe('GET /users/me', () => {
    it('returns the caller own profile', async () => {
      await createUser(ctx.prisma, 'self@example.com');
      const { accessToken } = await loginAs(ctx.app, 'self@example.com');

      const res = await http()
        .get('/api/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.email).toBe('self@example.com');
    });

    it('requires authentication', async () => {
      await http().get('/api/users/me').expect(401);
    });
  });

  describe('PATCH /users/me', () => {
    it('updates the caller own profile fields', async () => {
      await createUser(ctx.prisma, 'editme@example.com');
      const { accessToken } = await loginAs(ctx.app, 'editme@example.com');

      await http()
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ firstName: 'Edited', bio: 'hello' })
        .expect(200);

      const res = await http()
        .get('/api/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.firstName ?? res.body.profile?.firstName).toBe('Edited');
    });
  });

  describe('GET /users (list, accounts:read)', () => {
    it('lets a privileged caller list end-users', async () => {
      await createUser(ctx.prisma, 'listed1@example.com');
      await createUser(ctx.prisma, 'listed2@example.com');
      await createSuperAdmin(ctx.prisma, 'admin@example.com');
      const { accessToken } = await loginAs(ctx.app, 'admin@example.com');

      const res = await http()
        .get('/api/users?page=1&limit=20')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const data = res.body.data ?? res.body.items ?? res.body;
      expect(Array.isArray(data)).toBe(true);
      const emails = data.map((u: { email: string }) => u.email);
      expect(emails).toEqual(
        expect.arrayContaining(['listed1@example.com', 'listed2@example.com']),
      );
    });

    it('forbids an unprivileged user from listing accounts', async () => {
      await createUser(ctx.prisma, 'plain@example.com');
      const { accessToken } = await loginAs(ctx.app, 'plain@example.com');

      await http().get('/api/users').set('Authorization', `Bearer ${accessToken}`).expect(403);
    });
  });

  describe('GET /users/:id', () => {
    it('fetches a single end-user by id', async () => {
      const target = await createUser(ctx.prisma, 'target@example.com');
      await createSuperAdmin(ctx.prisma, 'admin2@example.com');
      const { accessToken } = await loginAs(ctx.app, 'admin2@example.com');

      const res = await http()
        .get(`/api/users/${target.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.email).toBe('target@example.com');
    });
  });
});
