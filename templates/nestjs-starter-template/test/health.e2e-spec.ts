import request from 'supertest';
import { createTestApp, TestContext } from './utils/app.factory';

describe('Health (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  // The memory_rss / disk thresholds are environment-sensitive (a jest worker
  // alone can exceed the 150MB RSS budget), so the aggregate status may be 503.
  // The invariant we assert is that the endpoint is reachable + public and that
  // the database connection is healthy regardless of the memory/disk verdict.
  it('GET /api/health is public and reports the database as healthy', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/health');

    expect([200, 503]).toContain(res.status);

    if (res.status === 200) {
      expect(res.body.status).toBe('ok');
      expect(res.body.details.database.status).toBe('up');
    } else {
      // The global exception filter reshapes terminus 503s: the failing
      // indicators are surfaced under `errorCode`. The DB must not be one.
      expect(res.body.errorCode).not.toHaveProperty('database');
    }
  });
});
