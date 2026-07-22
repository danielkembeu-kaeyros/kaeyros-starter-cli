import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditInterceptor } from './audit.interceptor';
import { LoggerService } from '../../common/logging/logger.service';

/**
 * Global audit logging. Services anywhere in the app can inject
 * AuditService and call log(...) directly; controller methods can also
 * declare @Audit({ action, resource }) for declarative coverage.
 */
@Global()
@Module({
  controllers: [AuditController],
  providers: [
    AuditService,
    LoggerService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AuditService],
})
export class AuditModule {}
