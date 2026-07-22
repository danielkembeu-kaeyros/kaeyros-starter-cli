import request from 'supertest';
import { createTestApp, TestContext } from './utils/app.factory';
import { STRONG_PASSWORD, createSuperAdmin, createUser, loginAs } from './utils/auth';

describe('Audit (e2e)', () => {
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

  it('records an audit entry for an audited action and lists it', async () => {
    // Registration writes an ACCOUNT_CREATED audit row synchronously.
    await http()
      .post('/api/auth/register')
      .send({ email: 'audited@example.com', password: STRONG_PASSWORD })
      .expect(201);

    await createSuperAdmin(ctx.prisma, 'root@example.com');
    const { accessToken } = await loginAs(ctx.app, 'root@example.com');

    const res = await http()
      .get('/api/admin/audit')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const data = res.body.data ?? res.body;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it('filters audit entries by action', async () => {
    await http()
      .post('/api/auth/register')
      .send({ email: 'filtered@example.com', password: STRONG_PASSWORD })
      .expect(201);

    await createSuperAdmin(ctx.prisma, 'root@example.com');
    const { accessToken } = await loginAs(ctx.app, 'root@example.com');

    const res = await http()
      .get('/api/admin/audit?action=ACCOUNT_CREATED')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const data = res.body.data ?? res.body;
    for (const row of data) {
      expect(row.action).toBe('ACCOUNT_CREATED');
    }
  });

  it('rejects an invalid action filter value', async () => {
    await createSuperAdmin(ctx.prisma, 'root@example.com');
    const { accessToken } = await loginAs(ctx.app, 'root@example.com');
    await http()
      .get('/api/admin/audit?action=NOT_A_REAL_ACTION')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);
  });

  it('enforces RBAC — a plain user cannot read the audit log', async () => {
    await createUser(ctx.prisma, 'plainaudit@example.com');
    const { accessToken } = await loginAs(ctx.app, 'plainaudit@example.com');
    await http().get('/api/admin/audit').set('Authorization', `Bearer ${accessToken}`).expect(403);
  });
});
