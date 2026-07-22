import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { TokenCleanupJob } from '../token-cleanup.job';
import { PrismaService } from '../../database/prisma.service';
import { LoggerService } from '../../../common/logging/logger.service';

describe('TokenCleanupJob', () => {
  let module: TestingModule;
  let job: TokenCleanupJob;

  const NOW = new Date('2026-06-30T12:00:00.000Z').getTime();

  const mockPrismaService = {
    refreshToken: { deleteMany: jest.fn() },
    emailVerification: { deleteMany: jest.fn() },
    passwordReset: { deleteMany: jest.fn() },
    loginOtp: { deleteMany: jest.fn() },
  };

  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);

    module = await Test.createTestingModule({
      providers: [
        TokenCleanupJob,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    job = module.get<TokenCleanupJob>(TokenCleanupJob);
  });

  afterEach(async () => {
    if (module) await module.close();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(job).toBeDefined();
  });

  describe('cleanupRefreshTokens', () => {
    it('deletes refresh tokens expired before a 30-day cutoff and logs', async () => {
      mockPrismaService.refreshToken.deleteMany.mockResolvedValue({ count: 3 });

      await job.cleanupRefreshTokens();

      const expectedCutoff = new Date(NOW - 30 * 86400_000);
      expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expectedCutoff } },
      });
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Deleted 3 expired refresh tokens',
        'TokenCleanupJob',
      );
    });

    it('does not log when nothing is deleted', async () => {
      mockPrismaService.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

      await job.cleanupRefreshTokens();

      expect(mockLogger.log).not.toHaveBeenCalled();
    });
  });

  describe('cleanupEmailVerifications', () => {
    it('deletes email verifications expired before a 7-day cutoff', async () => {
      mockPrismaService.emailVerification.deleteMany.mockResolvedValue({ count: 1 });

      await job.cleanupEmailVerifications();

      const expectedCutoff = new Date(NOW - 7 * 86400_000);
      expect(mockPrismaService.emailVerification.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expectedCutoff } },
      });
    });
  });

  describe('cleanupPasswordResets', () => {
    it('deletes password resets expired before a 7-day cutoff', async () => {
      mockPrismaService.passwordReset.deleteMany.mockResolvedValue({ count: 2 });

      await job.cleanupPasswordResets();

      const expectedCutoff = new Date(NOW - 7 * 86400_000);
      expect(mockPrismaService.passwordReset.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expectedCutoff } },
      });
    });
  });

  describe('cleanupLoginOtps', () => {
    it('deletes login OTPs expired before a 1-day cutoff', async () => {
      mockPrismaService.loginOtp.deleteMany.mockResolvedValue({ count: 5 });

      await job.cleanupLoginOtps();

      const expectedCutoff = new Date(NOW - 86400_000);
      expect(mockPrismaService.loginOtp.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expectedCutoff } },
      });
    });
  });
});
