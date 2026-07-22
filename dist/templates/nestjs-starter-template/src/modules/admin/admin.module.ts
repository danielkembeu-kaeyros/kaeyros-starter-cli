import { Module } from '@nestjs/common';
import { AdminAccountsModule } from './accounts/admin-accounts.module';
import { AdminRolesModule } from './roles/admin-roles.module';
import { AdminPermissionsModule } from './permissions/admin-permissions.module';

/**
 * Umbrella module for the /admin surface. Each sub-module is independent
 * at the service level — they only share the URL prefix and the seeded
 * RBAC permissions that gate their controllers.
 */
@Module({
  imports: [AdminAccountsModule, AdminRolesModule, AdminPermissionsModule],
})
export class AdminModule {}
