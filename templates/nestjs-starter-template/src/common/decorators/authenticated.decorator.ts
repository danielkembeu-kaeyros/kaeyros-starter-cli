import { SetMetadata } from '@nestjs/common';

export const AUTHENTICATED_KEY = 'authz:authenticated';

/**
 * Marks a route as requiring authentication but no specific permission.
 * Use sparingly — most routes should declare an explicit permission via
 * `@RequirePermissions`. Without either decorator (or `@Public()`) the
 * PermissionsGuard denies by default.
 */
export const Authenticated = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(AUTHENTICATED_KEY, true);
