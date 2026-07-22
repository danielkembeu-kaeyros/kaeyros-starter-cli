import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { OwnershipResolverRegistry } from './ownership.registry';
import { PermissionsGuard } from '../guards/permissions.guard';
import { OwnershipGuard } from '../guards/ownership.guard';

/**
 * Authorization layer.
 *
 * Globally registers PermissionsGuard (deny-by-default) and OwnershipGuard.
 * JwtAuthGuard is registered separately by the AuthModule (phase 4) AHEAD of
 * these so that `request.user` is populated by the time PermissionsGuard runs.
 *
 * Feature modules import this module to inject OwnershipResolverRegistry and
 * register their resource resolvers.
 */
@Global()
@Module({
  providers: [
    OwnershipResolverRegistry,
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    {
      provide: APP_GUARD,
      useClass: OwnershipGuard,
    },
  ],
  exports: [OwnershipResolverRegistry],
})
export class AuthzModule {}
