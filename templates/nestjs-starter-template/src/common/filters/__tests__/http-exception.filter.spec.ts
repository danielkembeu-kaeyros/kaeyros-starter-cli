import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, HttpStatus, ExecutionContext } from '@nestjs/common';
import { AllExceptionsFilter } from '../http-exception.filter';
import { LoggerService } from '../../../common/logging/logger.service';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

describe('AllExceptionsFilter', () => {
  let module: TestingModule;
  let filter: AllExceptionsFilter;
  let logger: LoggerService;
  let configService: ConfigService;

  const mockResponse = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };

  const mockLogger = {
    error: jest.fn(),
    logWithMeta: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        AllExceptionsFilter,
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    filter = module.get<AllExceptionsFilter>(AllExceptionsFilter);
    logger = module.get<LoggerService>(LoggerService);
    configService = module.get<ConfigService>(ConfigService);

    jest.spyOn(configService, 'get').mockReturnValue(false); // Sentry disabled by default in tests
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('should handle HttpException correctly', () => {
    const exception = new BadRequestException('Validation failed');
    const mockRequest = {
      method: 'POST',
      url: '/test',
      headers: {},
      body: {},
      query: {},
      params: {},
      requestId: 'req-123',
    };

    const mockContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    };

    filter.catch(exception, mockContext as ExecutionContext);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      timestamp: expect.any(String),
      path: '/test',
      method: 'POST',
      message: 'Validation failed',
      errorCode: 'Bad Request',
      requestId: 'req-123',
    });
    expect(logger.error).toHaveBeenCalled();
  });

  it('should handle Prisma unique constraint error (P2002)', () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`email`)',
      {
        code: 'P2002',
        meta: { target: ['email'] },
        clientVersion: '3.0.0',
      },
    );

    const mockRequest = {
      method: 'POST',
      url: '/users',
      headers: { authorization: 'Bearer token' },
      body: { email: 'test@example.com' },
      query: {},
      params: {},
      requestId: 'req-456',
    };

    const mockContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    };

    filter.catch(prismaError, mockContext as ExecutionContext);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.CONFLICT,
      timestamp: expect.any(String),
      path: '/users',
      method: 'POST',
      message: 'This email is already in use',
      errorCode: 'DUPLICATE_FIELD',
      field: 'email',
      requestId: 'req-456',
    });
    expect(logger.error).toHaveBeenCalled();
  });

  it('should handle generic error', () => {
    const genericError = new Error('Something went wrong');
    const mockRequest = {
      method: 'GET',
      url: '/error',
      headers: {},
      body: {},
      query: {},
      params: {},
      requestId: 'req-789',
    };

    const mockContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    };

    filter.catch(genericError, mockContext as ExecutionContext);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      timestamp: expect.any(String),
      path: '/error',
      method: 'GET',
      message: 'Something went wrong',
      errorCode: 'Error',
      requestId: 'req-789',
    });
    expect(logger.error).toHaveBeenCalled();
  });

  it('should sanitize sensitive headers and body data', () => {
    const exception = new BadRequestException('Bad request');
    const mockRequest = {
      method: 'POST',
      url: '/test',
      headers: {
        authorization: 'Bearer token',
        cookie: 'session=abc',
        'content-type': 'application/json',
      },
      body: {
        email: 'test@example.com',
        password: 'secret123',
        creditCard: '1234-5678-9012-3456',
        name: 'John Doe',
      },
      query: {},
      params: {},
      requestId: 'req-101',
    };

    const mockContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    };

    filter.catch(exception, mockContext as ExecutionContext);

    // Verify that the error was logged with sanitized headers and body
    expect(logger.logWithMeta).toHaveBeenCalledWith(
      'error',
      'Exception details',
      expect.objectContaining({
        request: expect.objectContaining({
          headers: expect.not.objectContaining({
            authorization: expect.any(String),
            cookie: expect.any(String),
          }),
          body: expect.objectContaining({
            password: '[REDACTED]',
            creditCard: '[REDACTED]',
            email: 'test@example.com',
            name: 'John Doe',
          }),
        }),
      }),
      'ExceptionFilter',
    );
  });
});
