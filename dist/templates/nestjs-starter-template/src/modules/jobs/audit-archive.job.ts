import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import * as zlib from 'zlib';
import { PrismaService } from '../database/prisma.service';
import { LoggerService } from '../../common/logging/logger.service';
import { STORAGE_PROVIDER, StorageProvider } from '../storage/storage.types';

const ROW_BATCH = 5000;

@Injectable()
export class AuditArchiveJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /**
   * Daily at 02:30 — ship audit rows older than ARCHIVE_AFTER_DAYS to
   * storage (without deleting) and stamp archivedAt so we don't ship
   * them twice.
   */
  @Cron('30 2 * * *')
  async archive(): Promise<void> {
    const days = this.configService.get<number>('AUDIT_ARCHIVE_AFTER_DAYS', 30);
    const cutoff = new Date(Date.now() - days * 86400_000);

    const where = { archivedAt: null, createdAt: { lt: cutoff } } as const;
    const total = await this.prisma.auditLog.count({ where });
    if (total === 0) {
      this.logger.log(`No audit rows older than ${days}d to archive`, 'AuditArchiveJob');
      return;
    }

    const stamp = cutoff.toISOString().slice(0, 10);
    const key = `archives/audit-logs/${stamp}-${Date.now()}.jsonl.gz`;

    let cursor: string | undefined;
    const lines: string[] = [];
    const archivedIds: string[] = [];
    while (archivedIds.length < total) {
      const batch = await this.prisma.auditLog.findMany({
        where,
        orderBy: { id: 'asc' },
        take: ROW_BATCH,
        ...(cursor && { skip: 1, cursor: { id: cursor } }),
      });
      if (batch.length === 0) break;
      for (const row of batch) {
        lines.push(JSON.stringify(row));
        archivedIds.push(row.id);
      }
      cursor = batch[batch.length - 1].id;
    }

    const compressed = zlib.gzipSync(Buffer.from(lines.join('\n'), 'utf8'));
    await this.storage.put({
      key,
      body: compressed,
      mimeType: 'application/gzip',
      metadata: {
        type: 'audit-logs',
        count: String(archivedIds.length),
        cutoff: cutoff.toISOString(),
      },
    });

    await this.prisma.auditLog.updateMany({
      where: { id: { in: archivedIds } },
      data: { archivedAt: new Date() },
    });

    this.logger.log(`Archived ${archivedIds.length} audit rows to ${key}`, 'AuditArchiveJob');
  }

  /**
   * Daily at 03:00 — delete audit rows older than the retention window
   * that have already been archived.
   */
  @Cron('0 3 * * *')
  async purge(): Promise<void> {
    const days = this.configService.get<number>('AUDIT_RETENTION_DAYS', 90);
    const cutoff = new Date(Date.now() - days * 86400_000);
    const { count } = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff }, archivedAt: { not: null } },
    });
    this.logger.log(`Purged ${count} archived audit rows older than ${days}d`, 'AuditArchiveJob');
  }
}
