import { SetMetadata } from '@nestjs/common';
import { CheckOwnershipMeta } from '../authz/types';

export const CHECK_OWNERSHIP_KEY = 'authz:ownership';

/**
 * Restricts the route to the owner of the targeted resource.
 *
 * Composes with @RequirePermissions: the caller must hold the permission
 * AND own the record identified by `params[param]`. The resource name
 * must be registered with the OwnershipResolverRegistry.
 *
 * @example
 *   @RequirePermissions('profile:update:own')
 *   @CheckOwnership({ resource: 'profile', param: 'id' })
 *   @Patch(':id')
 *   updateProfile(@Param('id') id: string, ...) {}
 */
export const CheckOwnership = (meta: CheckOwnershipMeta): ReturnType<typeof SetMetadata> =>
  SetMetadata(CHECK_OWNERSHIP_KEY, { param: 'id', ...meta });
