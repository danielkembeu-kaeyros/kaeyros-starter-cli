import request from 'supertest';
import { createTestApp, TestContext } from './utils/app.factory';
import { createUser, loginAs } from './utils/auth';

// Smallest valid PNG (1x1 transparent pixel).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

describe('Files (e2e)', () => {
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

  // Returns the supertest Test (chainable .expect / awaitable), not a Promise.
  const uploadAs = (token: string, filename = 'pic.png') =>
    http()
      .post('/api/files')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG, { filename, contentType: 'image/png' });

  it('uploads, lists, downloads and deletes an own file', async () => {
    await createUser(ctx.prisma, 'owner@example.com');
    const { accessToken } = await loginAs(ctx.app, 'owner@example.com');

    const uploaded = await uploadAs(accessToken).expect(201);
    const fileId = uploaded.body.id;
    expect(fileId).toBeDefined();
    expect(ctx.storage.objects.size).toBe(1);

    const list = await http()
      .get('/api/files/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(list.body).toHaveLength(1);

    const dl = await http()
      .get(`/api/files/${fileId}/download`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(dl.body.url).toMatch(/^https:\/\/fake-storage\.test\//);

    await http()
      .delete(`/api/files/${fileId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    const after = await http()
      .get('/api/files/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(after.body).toHaveLength(0);
  });

  it('rejects a disallowed MIME type', async () => {
    await createUser(ctx.prisma, 'mime@example.com');
    const { accessToken } = await loginAs(ctx.app, 'mime@example.com');
    await http()
      .post('/api/files')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('hi'), {
        filename: 'evil.exe',
        contentType: 'application/x-msdownload',
      })
      .expect(415);
  });

  it('rejects an upload with no file field', async () => {
    await createUser(ctx.prisma, 'nofile@example.com');
    const { accessToken } = await loginAs(ctx.app, 'nofile@example.com');
    await http().post('/api/files').set('Authorization', `Bearer ${accessToken}`).expect(400);
  });

  it('forbids downloading another user file (ownership)', async () => {
    await createUser(ctx.prisma, 'alice@example.com');
    await createUser(ctx.prisma, 'bob@example.com');
    const alice = await loginAs(ctx.app, 'alice@example.com');
    const bob = await loginAs(ctx.app, 'bob@example.com');

    const uploaded = await uploadAs(alice.accessToken).expect(201);
    const fileId = uploaded.body.id;

    await http()
      .get(`/api/files/${fileId}/download`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect((res) => {
        expect([403, 404]).toContain(res.status);
      });
  });

  it('requires authentication to upload', async () => {
    await uploadAs('not-a-token').then((res) => {
      expect(res.status).toBe(401);
    });
  });
});
