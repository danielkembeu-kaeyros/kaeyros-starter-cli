import { Module } from '@nestjs/common';
import { AdminAccountsController } from './admin-accounts.controller';
import { AdminAccountsService } from './admin-accounts.service';
import { EmailModule } from '../../email/email.module';
import { LoggerService } from '../../../common/logging/logger.service';

@Module({
  imports: [EmailModule],
  controllers: [AdminAccountsController],
  providers: [AdminAccountsService, LoggerService],
})
export class AdminAccountsModule {}
