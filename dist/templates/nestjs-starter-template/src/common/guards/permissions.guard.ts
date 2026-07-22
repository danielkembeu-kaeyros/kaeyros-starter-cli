import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AUTHENTICATED_KEY } from '../decorators/authenticated.decorator';
import {
  PERMISSIONS_ALL_KEY,
  PERMISSIONS_ANY_KEY,
} from '../decorators/require-permissions.decorator';
import { ForbiddenException, UnauthorizedException } from '../exceptions/custom-exceptions';
import { RequestUser } from '../authz/types';

/**
 * Zero-trust permission gate.
 *
 * Decision table (top to bottom; first match wins):
 *
 *   @Public()                           → allow
 *   no JWT user on request              → 401
 *   @RequirePermissions(a, b, ...)      → caller must hold ALL listed
 *   @RequireAnyPermission(a, b, ...)    → caller must hold AT LEAST ONE
 *   @Authenticated()                    → allow (signed-in is enough)
 *   none of the above                   → 403 (deny by default)
 *
 * This guard runs AFTER JwtAuthGuard (registered above it in app.module).
 * The contract is `request.user.permissions: string[]` — the flat array
 * built by JwtStrategy.validate.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    const all = this.reflector.getAllAndOverride<string[] | undefined>(
      PERMISSIONS_ALL_KEY,
      targets,
    );
    const any = this.reflector.getAllAndOverride<string[] | undefined>(
      PERMISSIONS_ANY_KEY,
      targets,
    );
    const authenticated = this.reflector.getAllAndOverride<boolean>(AUTHENTICATED_KEY, targets);

    if (all && all.length > 0) {
      const missing = all.filter((p) => !user.permissions.includes(p));
      if (missing.length > 0) {
        throw new ForbiddenException(`Missing required permissions: ${missing.join(', ')}`);
      }
      return true;
    }

    if (any && any.length > 0) {
      const hasOne = any.some((p) => user.permissions.includes(p));
      if (!hasOne) {
        throw new ForbiddenException(`Requires one of: ${any.join(', ')}`);
      }
      return true;
    }

    if (authenticated) return true;

    // No declaration → deny by default. The right fix is to add one of:
    //   @Public()   @Authenticated()   @RequirePermissions(...)   @RequireAnyPermission(...)
    throw new ForbiddenException(
      'This route declares no authorization metadata; deny-by-default applies',
    );
  }
}
