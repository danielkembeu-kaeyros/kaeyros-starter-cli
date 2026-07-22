import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LoggerService } from '../../../common/logging/logger.service';

describe('PrismaService', () => {
  let module: TestingModule;
  let service: PrismaService;
  let logger: LoggerService;

  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    logDatabaseQuery: jest.fn(),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        PrismaService,
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
    logger = module.get<LoggerService>(LoggerService);
  });

  afterEach(async () => {
    // Clean up event listeners to prevent memory leaks
    process.removeAllListeners('beforeExit');

    if (module) {
      await module.close();
    }
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should connect to the database', async () => {
      const connectSpy = jest.spyOn(service, '$connect').mockResolvedValue();

      await service.onModuleInit();

      expect(connectSpy).toHaveBeenCalled();
      expect(logger.log).toHaveBeenCalledWith('Database connected successfully', 'Prisma');
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect from the database', async () => {
      const disconnectSpy = jest.spyOn(service, '$disconnect').mockResolvedValue();

      await service.onModuleDestroy();

      expect(disconnectSpy).toHaveBeenCalled();
      expect(logger.log).toHaveBeenCalledWith('Database disconnected', 'Prisma');
    });
  });

  describe('enableShutdownHooks', () => {
    it('should set up shutdown hooks', async () => {
      const app = {
        close: jest.fn(),
      } as unknown as INestApplication;

      const closeSpy = jest.spyOn(app, 'close');

      service.enableShutdownHooks(app);

      // Trigger the beforeExit event
      process.emit('beforeExit', 0);

      // Wait for the promise to resolve
      await new Promise((resolve) => setImmediate(resolve));

      expect(closeSpy).toHaveBeenCalled();
    });
  });
});
