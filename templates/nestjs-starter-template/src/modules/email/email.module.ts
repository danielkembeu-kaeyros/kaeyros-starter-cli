import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailService } from './email.service';
import { LoggerService } from '@/common/logging/logger.service';

@Module({
  imports: [ConfigModule],
  providers: [EmailService, LoggerService],
  exports: [EmailService],
})
export class EmailModule {}
