import request from 'supertest';
import { AccountKind } from '@prisma/client';
import { createTestApp, TestContext } from './utils/app.factory';
import { createSuperAdmin, createUser, loginAs } from './utils/auth';

describe('Admin Accounts (e2e)', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());
  let token: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await ctx.reset();
    await createSuperAdmin(ctx.prisma, 'root@example.com');
    token = (await loginAs(ctx.app, 'root@example.com')).accessToken;
  });

  const auth = () => ['Authorization', `Bearer ${token}`] as [string, string];

  it('lists accounts', async () => {
    await createUser(ctx.prisma, 'u1@example.com');
    const res = await http()
      .get('/api/admin/accounts')
      .set(...auth())
      .expect(200);
    const data = res.body.data ?? res.body;
    expect(Array.isArray(data)).toBe(true);
  });

  it('creates an account and emails a temp password', async () => {
    const res = await http()
      .post('/api/admin/accounts')
      .set(...auth())
      .send({ email: 'created@example.com', kind: AccountKind.ADMIN, firstName: 'New' })
      .expect(201);
    expect(res.body.email).toBe('created@example.com');
    // The invite email carried a temporary password.
    expect(ctx.email.tempPassword('created@example.com')).toBeDefined();
  });

  it('rejects duplicate email on create', async () => {
    await createUser(ctx.prisma, 'dup@example.com');
    await http()
      .post('/api/admin/accounts')
      .set(...auth())
      .send({ email: 'dup@example.com', kind: AccountKind.USER })
      .expect(409);
  });

  it('updates an account profile', async () => {
    const target = await createUser(ctx.prisma, 'upd@example.com');
    await http()
      .patch(`/api/admin/accounts/${target.id}`)
      .set(...auth())
      .send({ firstName: 'Patched' })
      .expect(200);
  });

  it('disables then re-enables an account', async () => {
    const target = await createUser(ctx.prisma, 'toggle@example.com');

    await http()
      .post(`/api/admin/accounts/${target.id}/disable`)
      .set(...auth())
      .expect(200);
    // A disabled account cannot log in.
    await http()
      .post('/api/auth/login')
      .send({ email: 'toggle@example.com', password: target.password })
      .expect(401);

    await http()
      .post(`/api/admin/accounts/${target.id}/enable`)
      .set(...auth())
      .expect(200);
    await loginAs(ctx.app, 'toggle@example.com', target.password);
  });

  it('replaces account roles', async () => {
    const target = await createUser(ctx.prisma, 'roleme@example.com');
    const adminRole = await ctx.prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } });

    await http()
      .put(`/api/admin/accounts/${target.id}/roles`)
      .set(...auth())
      .send({ roleIds: [adminRole.id] })
      .expect(200);

    const roles = await ctx.prisma.accountRole.findMany({ where: { accountId: target.id } });
    expect(roles).toHaveLength(1);
    expect(roles[0].roleId).toBe(adminRole.id);
  });

  it('hard-deletes an account', async () => {
    const target = await createUser(ctx.prisma, 'gone@example.com');
    await http()
      .delete(`/api/admin/accounts/${target.id}`)
      .set(...auth())
      .expect(204);
    await http()
      .get(`/api/admin/accounts/${target.id}`)
      .set(...auth())
      .expect(404);
  });

  it('enforces RBAC — a plain user cannot manage accounts', async () => {
    await createUser(ctx.prisma, 'nobody@example.com');
    const userToken = (await loginAs(ctx.app, 'nobody@example.com')).accessToken;
    await http().get('/api/admin/accounts').set('Authorization', `Bearer ${userToken}`).expect(403);
  });
});
