import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { Request } from 'express';
import { AuditStatus } from '@prisma/client';
import { AuditService } from './audit.service';
import { AUDIT_KEY, AuditMeta } from './decorators/audit.decorator';
import { RequestUser } from '../../common/authz/types';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<AuditMeta | undefined>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta) return next.handle();

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser; params: Record<string, string> }>();

    const resourceIdParam = meta.resourceIdParam ?? 'id';
    const resourceId = request.params?.[resourceIdParam];
    const actor = request.user;

    return next.handle().pipe(
      tap(() => {
        void this.auditService.log(
          {
            action: meta.action,
            actorAccountId: actor?.id,
            actorEmail: actor?.email,
            resource: meta.resource,
            resourceId,
            status: AuditStatus.SUCCESS,
          },
          request,
        );
      }),
      catchError((err) => {
        void this.auditService.log(
          {
            action: meta.action,
            actorAccountId: actor?.id,
            actorEmail: actor?.email,
            resource: meta.resource,
            resourceId,
            status: AuditStatus.FAILURE,
            metadata: { error: err instanceof Error ? err.message : String(err) },
          },
          request,
        );
        return throwError(() => err);
      }),
    );
  }
}
