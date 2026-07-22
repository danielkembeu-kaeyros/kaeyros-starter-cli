import { Module } from '@nestjs/common';
import { AwsService } from './aws.service';

/**
 * Legacy AWS module — kept temporarily for log archival via winston.
 * Replaced in Phase 8 by the StorageProvider abstraction.
 */
@Module({
  providers: [AwsService],
  exports: [AwsService],
})
export class AwsModule {}
