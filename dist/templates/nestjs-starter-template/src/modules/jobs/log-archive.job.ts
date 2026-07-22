import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as zlib from 'zlib';
import { PrismaService } from '../database/prisma.service';
import { LoggerService } from '../../common/logging/logger.service';
import { STORAGE_PROVIDER, StorageProvider } from '../storage/storage.types';

const ROW_BATCH = 5000;

@Injectable()
export class LogArchiveJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /**
   * Daily at 02:00 — archive application logs older than the retention
   * window to storage, then delete the live rows.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async run(): Promise<void> {
    const days = this.configService.get<number>('LOG_ARCHIVE_AFTER_DAYS', 30);
    const cutoff = new Date(Date.now() - days * 86400_000);

    const total = await this.prisma.log.count({ where: { createdAt: { lt: cutoff } } });
    if (total === 0) {
      this.logger.log(`No application logs older than ${days}d to archive`, 'LogArchiveJob');
      return;
    }

    const stamp = cutoff.toISOString().slice(0, 10);
    const key = `archives/logs/${stamp}-${Date.now()}.jsonl.gz`;

    let cursor: string | undefined;
    const lines: string[] = [];
    let archived = 0;
    while (archived < total) {
      const batch = await this.prisma.log.findMany({
        where: { createdAt: { lt: cutoff } },
        orderBy: { id: 'asc' },
        take: ROW_BATCH,
        ...(cursor && { skip: 1, cursor: { id: cursor } }),
      });
      if (batch.length === 0) break;
      for (const row of batch) lines.push(JSON.stringify(row));
      archived += batch.length;
      cursor = batch[batch.length - 1].id;
    }

    const compressed = zlib.gzipSync(Buffer.from(lines.join('\n'), 'utf8'));
    await this.storage.put({
      key,
      body: compressed,
      mimeType: 'application/gzip',
      metadata: { type: 'application-logs', count: String(archived), cutoff: cutoff.toISOString() },
    });

    const { count } = await this.prisma.log.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    this.logger.log(`Archived ${archived} logs to ${key}; deleted ${count} rows`, 'LogArchiveJob');
  }
}
