import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { LoggerService } from '../../common/logging/logger.service';

@Injectable()
export class TokenCleanupJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Hourly — delete expired refresh tokens past a 30-day grace window so
   * audit and reuse-detection have a chance to read them.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupRefreshTokens(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 86400_000);
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    if (count > 0) {
      this.logger.log(`Deleted ${count} expired refresh tokens`, 'TokenCleanupJob');
    }
  }

  /** Hourly — delete email verifications past a 7-day grace window. */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupEmailVerifications(): Promise<void> {
    const cutoff = new Date(Date.now() - 7 * 86400_000);
    const { count } = await this.prisma.emailVerification.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    if (count > 0) {
      this.logger.log(`Deleted ${count} expired email verifications`, 'TokenCleanupJob');
    }
  }

  /** Hourly — delete password resets past a 7-day grace window. */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupPasswordResets(): Promise<void> {
    const cutoff = new Date(Date.now() - 7 * 86400_000);
    const { count } = await this.prisma.passwordReset.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    if (count > 0) {
      this.logger.log(`Deleted ${count} expired password resets`, 'TokenCleanupJob');
    }
  }

  /** Hourly — delete login OTPs past a 1-day grace window. */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupLoginOtps(): Promise<void> {
    const cutoff = new Date(Date.now() - 86400_000);
    const { count } = await this.prisma.loginOtp.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    if (count > 0) {
      this.logger.log(`Deleted ${count} expired login OTPs`, 'TokenCleanupJob');
    }
  }
}
