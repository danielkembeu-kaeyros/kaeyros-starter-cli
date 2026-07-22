import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { LoggingInterceptor } from '../logging.interceptor';
import { LoggerService } from '../../../common/logging/logger.service';

describe('LoggingInterceptor', () => {
  let module: TestingModule;
  let interceptor: LoggingInterceptor;
  let logger: LoggerService;

  const mockLogger = {
    logHttpRequest: jest.fn(),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        LoggingInterceptor,
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    interceptor = module.get<LoggingInterceptor>(LoggingInterceptor);
    logger = module.get<LoggerService>(LoggerService);
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should log HTTP request after handling', (done) => {
    const mockRequest = {
      method: 'GET',
      url: '/test',
      user: { id: '123' },
    };
    const mockResponse = {
      statusCode: 200,
    };
    const mockContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    };

    const mockCallHandler = {
      handle: jest.fn().mockReturnValue(of('response_data')),
    };

    interceptor
      .intercept(mockContext as ExecutionContext, mockCallHandler as CallHandler)
      .subscribe({
        next: () => {
          expect(mockCallHandler.handle).toHaveBeenCalled();
          expect(logger.logHttpRequest).toHaveBeenCalledWith(
            'GET',
            '/test',
            200,
            expect.any(Number), // delay is calculated from time
            '123',
          );
          done();
        },
      });
  });

  it('should handle request without user', (done) => {
    const mockRequest = {
      method: 'POST',
      url: '/test',
    };
    const mockResponse = {
      statusCode: 201,
    };
    const mockContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    };

    const mockCallHandler = {
      handle: jest.fn().mockReturnValue(of('response_data')),
    };

    interceptor
      .intercept(mockContext as ExecutionContext, mockCallHandler as CallHandler)
      .subscribe({
        next: () => {
          expect(logger.logHttpRequest).toHaveBeenCalledWith(
            'POST',
            '/test',
            201,
            expect.any(Number), // delay is calculated from time
            undefined,
          );
          done();
        },
      });
  });
});
