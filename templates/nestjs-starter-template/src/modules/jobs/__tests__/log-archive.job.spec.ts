import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { LogArchiveJob } from '../log-archive.job';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { LoggerService } from '../../../common/logging/logger.service';
import { STORAGE_PROVIDER } from '../../storage/storage.types';

describe('LogArchiveJob', () => {
  let module: TestingModule;
  let job: LogArchiveJob;

  const NOW = new Date('2026-06-30T12:00:00.000Z').getTime();

  const mockPrismaService = {
    log: {
      count: jest.fn(),
      findMany: jest.fn(),
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
      if (key === 'LOG_ARCHIVE_AFTER_DAYS') return 30;
      return def;
    });

    module = await Test.createTestingModule({
      providers: [
        LogArchiveJob,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLogger },
        { provide: STORAGE_PROVIDER, useValue: mockStorage },
      ],
    }).compile();

    job = module.get<LogArchiveJob>(LogArchiveJob);
  });

  afterEach(async () => {
    if (module) await module.close();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(job).toBeDefined();
  });

  describe('run', () => {
    it('returns early without storing or deleting when there are no rows', async () => {
      mockPrismaService.log.count.mockResolvedValue(0);

      await job.run();

      const expectedCutoff = new Date(NOW - 30 * 86400_000);
      expect(mockPrismaService.log.count).toHaveBeenCalledWith({
        where: { createdAt: { lt: expectedCutoff } },
      });
      expect(mockStorage.put).not.toHaveBeenCalled();
      expect(mockPrismaService.log.deleteMany).not.toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith(
        'No application logs older than 30d to archive',
        'LogArchiveJob',
      );
    });

    it('archives logs to storage and deletes the live rows using the cutoff', async () => {
      const expectedCutoff = new Date(NOW - 30 * 86400_000);
      const rows = [{ id: '1' }, { id: '2' }, { id: '3' }];

      mockPrismaService.log.count.mockResolvedValue(3);
      mockPrismaService.log.findMany.mockResolvedValueOnce(rows).mockResolvedValue([]);
      mockStorage.put.mockResolvedValue({ key: 'k', size: 1 });
      mockPrismaService.log.deleteMany.mockResolvedValue({ count: 3 });

      await job.run();

      expect(mockPrismaService.log.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { createdAt: { lt: expectedCutoff } },
          orderBy: { id: 'asc' },
          take: 5000,
        }),
      );

      expect(mockStorage.put).toHaveBeenCalledTimes(1);
      const putArg = mockStorage.put.mock.calls[0][0];
      expect(putArg.mimeType).toBe('application/gzip');
      expect(putArg.key).toContain('archives/logs/');
      expect(Buffer.isBuffer(putArg.body)).toBe(true);
      expect(putArg.metadata).toMatchObject({
        type: 'application-logs',
        count: '3',
        cutoff: expectedCutoff.toISOString(),
      });

      expect(mockPrismaService.log.deleteMany).toHaveBeenCalledWith({
        where: { createdAt: { lt: expectedCutoff } },
      });
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Archived 3 logs'),
        'LogArchiveJob',
      );
    });
  });
});
