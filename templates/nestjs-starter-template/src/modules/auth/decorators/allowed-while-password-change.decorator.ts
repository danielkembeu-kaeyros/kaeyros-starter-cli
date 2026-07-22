import { SetMetadata } from '@nestjs/common';

export const ALLOWED_WHILE_PASSWORD_CHANGE_KEY = 'authz:allowed-while-password-change';

/**
 * Marks a route as callable while the authenticated account has
 * mustChangePassword=true. Use only on:
 *   - the change-initial-password endpoint
 *   - the logout endpoint
 *
 * Every other authenticated route is blocked by MustChangePasswordGuard
 * while the flag is set.
 */
export const AllowedWhilePasswordChange = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(ALLOWED_WHILE_PASSWORD_CHANGE_KEY, true);
