import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { of, throwError, lastValueFrom } from 'rxjs';
import { PerformanceInterceptor } from '../performance.interceptor';
import { LoggerService } from '../../logging/logger.service';
import * as sentryConfig from '../../../config/sentry.config';

describe('PerformanceInterceptor', () => {
  let module: TestingModule;
  let interceptor: PerformanceInterceptor;
  let logger: LoggerService;

  const mockLogger = {
    warn: jest.fn(),
    error: jest.fn(),
  };

  const buildContext = (request: Record<string, unknown> = {}): ExecutionContext =>
    ({
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => ({ method: 'GET', url: '/test', ...request }),
      }),
      getHandler: jest.fn().mockReturnValue({ name: 'handlerName' }),
      getClass: jest.fn().mockReturnValue({ name: 'ControllerName' }),
    }) as unknown as ExecutionContext;

  const buildHandler = (value: unknown): CallHandler => ({
    handle: jest.fn().mockReturnValue(of(value)),
  });

  async function setup(enableMetrics = false): Promise<void> {
    module = await Test.createTestingModule({
      providers: [
        PerformanceInterceptor,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(enableMetrics) },
        },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    interceptor = module.get<PerformanceInterceptor>(PerformanceInterceptor);
    logger = module.get<LoggerService>(LoggerService);
  }

  afterEach(async () => {
    if (module) {
      await module.close();
    }
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('should be defined', async () => {
    await setup();
    expect(interceptor).toBeDefined();
  });

  it('should pass the handler response through unchanged', async () => {
    await setup();
    const result = await lastValueFrom(
      interceptor.intercept(buildContext(), buildHandler('response_data')),
    );
    expect(result).toBe('response_data');
  });

  it('should NOT warn for fast requests (<= 1000ms)', async () => {
    await setup();
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(0); // startTime
    nowSpy.mockReturnValueOnce(500); // tap next -> duration 500ms

    await lastValueFrom(interceptor.intercept(buildContext(), buildHandler('ok')));

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('should warn for slow requests (> 1000ms)', async () => {
    await setup();
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(0); // startTime
    nowSpy.mockReturnValueOnce(1500); // tap next -> duration 1500ms

    await lastValueFrom(interceptor.intercept(buildContext(), buildHandler('ok')));

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Slow request detected'),
      'Performance',
    );
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('1500ms'), 'Performance');
  });

  it('should NOT emit Sentry metrics when metrics are disabled', async () => {
    await setup(false);
    const metricSpy = jest
      .spyOn(sentryConfig, 'captureSentryMetric')
      .mockImplementation(() => undefined);

    await lastValueFrom(interceptor.intercept(buildContext(), buildHandler('ok')));

    expect(metricSpy).not.toHaveBeenCalled();
  });

  it('should emit Sentry metrics when metrics are enabled', async () => {
    await setup(true);
    const metricSpy = jest
      .spyOn(sentryConfig, 'captureSentryMetric')
      .mockImplementation(() => undefined);

    await lastValueFrom(
      interceptor.intercept(buildContext({ route: { path: '/test/:id' } }), buildHandler('ok')),
    );

    expect(metricSpy).toHaveBeenCalledWith(
      'http.request.duration',
      expect.any(Number),
      'millisecond',
      expect.objectContaining({
        method: 'GET',
        route: '/test/:id',
        controller: 'ControllerName',
        handler: 'handlerName',
      }),
    );
  });

  it('should log an error and rethrow when the handler errors', async () => {
    await setup();
    const failingHandler: CallHandler = {
      handle: jest.fn().mockReturnValue(throwError(() => new Error('boom'))),
    };

    await expect(
      lastValueFrom(interceptor.intercept(buildContext(), failingHandler)),
    ).rejects.toThrow('boom');

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Request failed'),
      expect.any(String),
      'Performance',
    );
  });
});
