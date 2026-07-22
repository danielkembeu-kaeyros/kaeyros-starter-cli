import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { ForbiddenException } from '../../../common/exceptions/custom-exceptions';
import { RequestUser } from '../../../common/authz/types';
import { ALLOWED_WHILE_PASSWORD_CHANGE_KEY } from '../decorators/allowed-while-password-change.decorator';

/**
 * Locks an authenticated account into the change-initial-password / logout
 * loop while `mustChangePassword` is true.
 *
 * Order in app.module: runs AFTER JwtAuthGuard and PermissionsGuard, so
 * `request.user` is populated and the permission check has already passed.
 */
@Injectable()
export class MustChangePasswordGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request.user;
    if (!user || !user.mustChangePassword) return true;

    const allowed = this.reflector.getAllAndOverride<boolean>(
      ALLOWED_WHILE_PASSWORD_CHANGE_KEY,
      targets,
    );
    if (allowed) return true;

    throw new ForbiddenException(
      'You must change your initial password before using the rest of the API',
    );
  }
}
