import { SetMetadata } from '@nestjs/common';
import { AuditAction } from '@prisma/client';

export const AUDIT_KEY = 'audit:meta';

export interface AuditMeta {
  action: AuditAction;
  /** Logical resource name (e.g. 'account', 'role'). */
  resource?: string;
  /** Name of the route param holding the resource id (e.g. 'id'). Defaults to 'id'. */
  resourceIdParam?: string;
}

/**
 * Declaratively audit a controller method. The interceptor writes a row
 * on both success and failure, capturing the actor + IP + UA from the
 * request.
 *
 * For events that happen mid-service (LOGIN_FAILED before request.user
 * exists, etc.) call AuditService.log directly instead.
 */
export const Audit = (meta: AuditMeta): ReturnType<typeof SetMetadata> =>
  SetMetadata(AUDIT_KEY, meta);
