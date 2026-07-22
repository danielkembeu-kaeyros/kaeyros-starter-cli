import request from 'supertest';
import { createTestApp, TestContext } from './utils/app.factory';
import { createSuperAdmin, createUser, loginAs } from './utils/auth';

describe('Admin Permissions (e2e)', () => {
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

  it('lists the seeded system permissions', async () => {
    const res = await http()
      .get('/api/admin/permissions')
      .set(...auth())
      .expect(200);
    const data = res.body.data ?? res.body;
    const names = data.map((p: { name: string }) => p.name);
    expect(names).toEqual(expect.arrayContaining(['accounts:read', 'audit:read']));
  });

  it('creates and deletes a non-system permission', async () => {
    const created = await http()
      .post('/api/admin/permissions')
      .set(...auth())
      .send({ name: 'posts:read', resource: 'posts', action: 'read' })
      .expect(201);
    expect(created.body.id).toBeDefined();

    await http()
      .delete(`/api/admin/permissions/${created.body.id}`)
      .set(...auth())
      .expect(204);
  });

  it('rejects a malformed permission name', async () => {
    await http()
      .post('/api/admin/permissions')
      .set(...auth())
      .send({ name: 'NotValid', resource: 'x', action: 'y' })
      .expect(400);
  });

  it('refuses to delete a system permission', async () => {
    const sys = await ctx.prisma.permission.findUniqueOrThrow({ where: { name: 'accounts:read' } });
    await http()
      .delete(`/api/admin/permissions/${sys.id}`)
      .set(...auth())
      .expect((res) => {
        expect([400, 403]).toContain(res.status);
      });
  });

  it('enforces RBAC — a plain user cannot read permissions', async () => {
    await createUser(ctx.prisma, 'plainperm@example.com');
    const userToken = (await loginAs(ctx.app, 'plainperm@example.com')).accessToken;
    await http()
      .get('/api/admin/permissions')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });
});
