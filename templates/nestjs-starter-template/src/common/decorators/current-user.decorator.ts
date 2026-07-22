import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestUser } from '../authz/types';

/**
 * Resolves the current authenticated user from the request.
 * Pass a field name to project one property:
 *
 *   @CurrentUser() user: RequestUser
 *   @CurrentUser('id') accountId: string
 *
 * Returns `undefined` on `@Public()` routes where no JWT was processed.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof RequestUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
