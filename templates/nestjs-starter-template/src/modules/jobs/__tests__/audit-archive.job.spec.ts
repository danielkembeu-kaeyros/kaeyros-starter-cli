import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditArchiveJob } from '../audit-archive.job';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { LoggerService } from '../../../common/logging/logger.service';
import { STORAGE_PROVIDER } from '../../storage/storage.types';

describe('AuditArchiveJob', () => {
  let module: TestingModule;
  let job: AuditArchiveJob;

  const NOW = new Date('2026-06-30T12:00:00.000Z').getTime();

  const mockPrismaService = {
    auditLog: {
      count: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  const mockStorage = {
    put: jest.fn(),
    remove: jest.fn(),
    getDownloadUrl: jest.fn(),
    exists: jest.fn(),
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);

    mockConfigService.get.mockImplementation((key: string, def?: number) => {
      switch (key) {
        case 'AUDIT_ARCHIVE_AFTER_DAYS':
          return 30;
        case 'AUDIT_RETENTION_DAYS':
          return 90;
        default:
          return def;
      }
    });

    module = await Test.createTestingModule({
      providers: [
        AuditArchiveJob,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLogger },
        { provide: STORAGE_PROVIDER, useValue: mockStorage },
      ],
    }).compile();

    job = module.get<AuditArchiveJob>(AuditArchiveJob);
  });

  afterEach(async () => {
    if (module) await module.close();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(job).toBeDefined();
  });

  describe('archive', () => {
    it('returns early without storing when there are no rows to archive', async () => {
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      await job.archive();

      const expectedCutoff = new Date(NOW - 30 * 86400_000);
      expect(mockPrismaService.auditLog.count).toHaveBeenCalledWith({
        where: { archivedAt: null, createdAt: { lt: expectedCutoff } },
      });
      expect(mockStorage.put).not.toHaveBeenCalled();
      expect(mockPrismaService.auditLog.updateMany).not.toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith(
        'No audit rows older than 30d to archive',
        'AuditArchiveJob',
      );
    });

    it('ships rows to storage and stamps archivedAt with the configured cutoff', async () => {
      const expectedCutoff = new Date(NOW - 30 * 86400_000);
      const rows = [
        { id: 'a', createdAt: expectedCutoff },
        { id: 'b', createdAt: expectedCutoff },
      ];

      mockPrismaService.auditLog.count.mockResolvedValue(2);
      mockPrismaService.auditLog.findMany.mockResolvedValueOnce(rows).mockResolvedValue([]);
      mockStorage.put.mockResolvedValue({ key: 'k', size: 1 });
      mockPrismaService.auditLog.updateMany.mockResolvedValue({ count: 2 });

      await job.archive();

      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { archivedAt: null, createdAt: { lt: expectedCutoff } },
          orderBy: { id: 'asc' },
          take: 5000,
        }),
      );

      expect(mockStorage.put).toHaveBeenCalledTimes(1);
      const putArg = mockStorage.put.mock.calls[0][0];
      expect(putArg.mimeType).toBe('application/gzip');
      expect(putArg.key).toContain('archives/audit-logs/');
      expect(Buffer.isBuffer(putArg.body)).toBe(true);
      expect(putArg.metadata).toMatchObject({
        type: 'audit-logs',
        count: '2',
        cutoff: expectedCutoff.toISOString(),
      });

      expect(mockPrismaService.auditLog.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['a', 'b'] } },
        data: { archivedAt: new Date(NOW) },
      });
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Archived 2 audit rows'),
        'AuditArchiveJob',
      );
    });
  });

  describe('purge', () => {
    it('deletes archived rows older than the retention cutoff', async () => {
      mockPrismaService.auditLog.deleteMany.mockResolvedValue({ count: 7 });

      await job.purge();

      const expectedCutoff = new Date(NOW - 90 * 86400_000);
      expect(mockPrismaService.auditLog.deleteMany).toHaveBeenCalledWith({
        where: { createdAt: { lt: expectedCutoff }, archivedAt: { not: null } },
      });
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Purged 7 archived audit rows older than 90d',
        'AuditArchiveJob',
      );
    });
  });
});
