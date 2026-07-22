import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditAction, AuditStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit.service';
import { PrismaService } from '../../database/prisma.service';
import { LoggerService } from '../../../common/logging/logger.service';

describe('AuditService', () => {
  let module: TestingModule;
  let service: AuditService;

  const mockPrisma = {
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    // array form
    $transaction: jest.fn(async (arr: Promise<unknown>[]) => Promise.all(arr)),
  };

  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  afterEach(async () => {
    if (module) await module.close();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('log', () => {
    it('persists an audit row with provided values', async () => {
      mockPrisma.auditLog.create.mockResolvedValue({});

      await service.log({
        action: AuditAction.LOGIN,
        actorAccountId: 'a1',
        actorEmail: 'a@x.com',
        resource: 'account',
        resourceId: 'r1',
        status: AuditStatus.SUCCESS,
        ipAddress: '1.2.3.4',
        userAgent: 'agent',
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: AuditAction.LOGIN,
          actorAccountId: 'a1',
          actorEmail: 'a@x.com',
          resource: 'account',
          resourceId: 'r1',
          status: AuditStatus.SUCCESS,
          ipAddress: '1.2.3.4',
          userAgent: 'agent',
        }),
      });
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('falls back to request ip/user-agent and defaults', async () => {
      mockPrisma.auditLog.create.mockResolvedValue({});
      const request = { ip: '9.9.9.9', get: jest.fn().mockReturnValue('ua') } as any;

      await service.log({ action: AuditAction.LOGIN_FAILED }, request);

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: AuditStatus.SUCCESS,
          metadata: Prisma.JsonNull,
          ipAddress: '9.9.9.9',
          userAgent: 'ua',
          actorAccountId: null,
        }),
      });
    });

    it('swallows and logs persistence errors without throwing', async () => {
      mockPrisma.auditLog.create.mockRejectedValue(new Error('db down'));

      await expect(service.log({ action: AuditAction.LOGIN })).resolves.toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns paginated results with no filters', async () => {
      const rows = [{ id: 'l1' }];
      mockPrisma.auditLog.findMany.mockResolvedValue(rows);
      mockPrisma.auditLog.count.mockResolvedValue(1);

      const result = await service.list({ page: 1, limit: 10 });

      expect(result).toEqual({ data: rows, total: 1, page: 1, limit: 10 });
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      });
    });

    it('applies filters and pagination offset', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);
      const from = new Date('2024-01-01');
      const to = new Date('2024-02-01');

      await service.list({
        page: 2,
        limit: 5,
        action: AuditAction.LOGIN,
        actorAccountId: 'a1',
        status: AuditStatus.FAILURE,
        from,
        to,
      });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          action: AuditAction.LOGIN,
          actorAccountId: 'a1',
          status: AuditStatus.FAILURE,
          createdAt: { gte: from, lte: to },
        },
        orderBy: { createdAt: 'desc' },
        skip: 5,
        take: 5,
      });
    });
  });
});
