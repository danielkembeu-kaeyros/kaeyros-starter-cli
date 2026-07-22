import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_ALL_KEY = 'authz:permissions:all';
export const PERMISSIONS_ANY_KEY = 'authz:permissions:any';

/**
 * Caller must hold EVERY listed permission.
 *
 * @example
 *   @RequirePermissions('accounts:read', 'accounts:update')
 *   updateAccount() {...}
 */
export const RequirePermissions = (...permissions: string[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(PERMISSIONS_ALL_KEY, permissions);

/**
 * Caller must hold AT LEAST ONE listed permission.
 *
 * @example
 *   @RequireAnyPermission('accounts:read', 'accounts:create')
 *   listOrCreate() {...}
 */
export const RequireAnyPermission = (...permissions: string[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(PERMISSIONS_ANY_KEY, permissions);
