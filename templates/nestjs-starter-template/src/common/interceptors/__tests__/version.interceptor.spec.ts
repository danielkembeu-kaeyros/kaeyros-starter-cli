import 'reflect-metadata';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import { VersionInterceptor } from '../version.interceptor';

describe('VersionInterceptor', () => {
  let interceptor: VersionInterceptor;

  const buildContext = (request: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => ({ headers: {}, query: {}, url: '/test', ...request }),
      }),
    }) as unknown as ExecutionContext;

  const buildHandler = (value: unknown): CallHandler => ({
    handle: jest.fn().mockReturnValue(of(value)),
  });

  beforeEach(() => {
    interceptor = new VersionInterceptor();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should augment object responses with version + timestamp metadata', async () => {
    const result = (await lastValueFrom(
      interceptor.intercept(buildContext({}), buildHandler({ id: 1, name: 'foo' })),
    )) as Record<string, unknown> & { _metadata: { version: string; timestamp: string } };

    expect(result.id).toBe(1);
    expect(result.name).toBe('foo');
    expect(result._metadata.version).toBe('v1');
    expect(typeof result._metadata.timestamp).toBe('string');
    // ISO timestamp
    expect(new Date(result._metadata.timestamp).toISOString()).toBe(result._metadata.timestamp);
  });

  it('should default to v1 when no version is provided', async () => {
    const result = (await lastValueFrom(
      interceptor.intercept(buildContext({}), buildHandler({})),
    )) as { _metadata: { version: string } };
    expect(result._metadata.version).toBe('v1');
  });

  it('should extract version from the api-version header', async () => {
    const result = (await lastValueFrom(
      interceptor.intercept(buildContext({ headers: { 'api-version': 'v3' } }), buildHandler({})),
    )) as { _metadata: { version: string } };
    expect(result._metadata.version).toBe('v3');
  });

  it('should extract version from the query param', async () => {
    const result = (await lastValueFrom(
      interceptor.intercept(buildContext({ query: { version: 'v2' } }), buildHandler({})),
    )) as { _metadata: { version: string } };
    expect(result._metadata.version).toBe('v2');
  });

  it('should extract version from the URL path', async () => {
    const result = (await lastValueFrom(
      interceptor.intercept(buildContext({ url: '/v4/accounts/' }), buildHandler({})),
    )) as { _metadata: { version: string } };
    expect(result._metadata.version).toBe('v4');
  });

  it('should preserve array responses as-is without metadata', async () => {
    const payload = [{ id: 1 }, { id: 2 }];
    const result = await lastValueFrom(
      interceptor.intercept(buildContext({}), buildHandler(payload)),
    );
    expect(result).toEqual(payload);
    expect(Array.isArray(result)).toBe(true);
    expect((result as Record<string, unknown>)._metadata).toBeUndefined();
  });
});
