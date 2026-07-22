import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { LogArchiveJob } from './log-archive.job';
import { AuditArchiveJob } from './audit-archive.job';
import { TokenCleanupJob } from './token-cleanup.job';
import { StorageModule } from '../storage/storage.module';
import { LoggerService } from '../../common/logging/logger.service';

@Module({
  imports: [ScheduleModule.forRoot(), StorageModule],
  providers: [LogArchiveJob, AuditArchiveJob, TokenCleanupJob, LoggerService],
})
export class JobsModule {}
