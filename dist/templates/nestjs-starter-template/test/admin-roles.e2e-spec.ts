import request from 'supertest';
import { createTestApp, TestContext } from './utils/app.factory';
import { createSuperAdmin, createUser, loginAs } from './utils/auth';

describe('Admin Roles (e2e)', () => {
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

  it('lists roles including the seeded system roles', async () => {
    const res = await http()
      .get('/api/admin/roles')
      .set(...auth())
      .expect(200);
    const data = res.body.data ?? res.body;
    const names = data.map((r: { name: string }) => r.name);
    expect(names).toEqual(expect.arrayContaining(['SUPER_ADMIN', 'ADMIN', 'USER']));
  });

  it('creates, updates and deletes a non-system role', async () => {
    const created = await http()
      .post('/api/admin/roles')
      .set(...auth())
      .send({ name: 'EDITOR', description: 'Edits content' })
      .expect(201);
    const id = created.body.id;
    expect(id).toBeDefined();

    await http()
      .patch(`/api/admin/roles/${id}`)
      .set(...auth())
      .send({ description: 'Updated' })
      .expect(200);

    await http()
      .delete(`/api/admin/roles/${id}`)
      .set(...auth())
      .expect(204);
  });

  it('replaces a role permission set', async () => {
    const created = await http()
      .post('/api/admin/roles')
      .set(...auth())
      .send({ name: 'REPORTER' })
      .expect(201);
    const perm = await ctx.prisma.permission.findUniqueOrThrow({ where: { name: 'audit:read' } });

    await http()
      .put(`/api/admin/roles/${created.body.id}/permissions`)
      .set(...auth())
      .send({ permissionIds: [perm.id] })
      .expect(200);

    const links = await ctx.prisma.rolePermission.findMany({ where: { roleId: created.body.id } });
    expect(links.map((l) => l.permissionId)).toContain(perm.id);
  });

  it('refuses to update a system role', async () => {
    const sys = await ctx.prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } });
    await http()
      .patch(`/api/admin/roles/${sys.id}`)
      .set(...auth())
      .send({ description: 'nope' })
      .expect((res) => {
        expect([400, 403]).toContain(res.status);
      });
  });

  it('enforces RBAC — a plain user cannot read roles', async () => {
    await createUser(ctx.prisma, 'plainrole@example.com');
    const userToken = (await loginAs(ctx.app, 'plainrole@example.com')).accessToken;
    await http().get('/api/admin/roles').set('Authorization', `Bearer ${userToken}`).expect(403);
  });
});
