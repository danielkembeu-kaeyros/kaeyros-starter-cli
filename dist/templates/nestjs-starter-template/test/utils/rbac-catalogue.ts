/**
 * RBAC catalogue for the e2e test database.
 *
 * Mirrors the system permissions/roles defined in `prisma/seed.ts`. It is
 * duplicated here (rather than imported) because `prisma/seed.ts` runs `main()`
 * on import — importing it would connect to the DB and provision a super admin
 * as a side effect. Keep this in sync with the seed.
 */

export const SYSTEM_PERMISSIONS: Array<{
  name: string;
  resource: string;
  action: string;
  description: string;
}> = [
  {
    name: 'accounts:read',
    resource: 'accounts',
    action: 'read',
    description: 'List/read any account',
  },
  {
    name: 'accounts:create',
    resource: 'accounts',
    action: 'create',
    description: 'Create accounts (users or admins)',
  },
  {
    name: 'accounts:update',
    resource: 'accounts',
    action: 'update',
    description: 'Update any account',
  },
  {
    name: 'accounts:disable',
    resource: 'accounts',
    action: 'disable',
    description: 'Disable or re-enable accounts',
  },
  {
    name: 'accounts:delete',
    resource: 'accounts',
    action: 'delete',
    description: 'Soft-delete accounts',
  },
  { name: 'roles:read', resource: 'roles', action: 'read', description: 'List/read roles' },
  { name: 'roles:create', resource: 'roles', action: 'create', description: 'Create roles' },
  {
    name: 'roles:update',
    resource: 'roles',
    action: 'update',
    description: 'Update non-system roles',
  },
  {
    name: 'roles:delete',
    resource: 'roles',
    action: 'delete',
    description: 'Delete non-system roles',
  },
  {
    name: 'roles:assign',
    resource: 'roles',
    action: 'assign',
    description: 'Grant/revoke roles on accounts',
  },
  {
    name: 'permissions:read',
    resource: 'permissions',
    action: 'read',
    description: 'List/read permissions',
  },
  {
    name: 'permissions:create',
    resource: 'permissions',
    action: 'create',
    description: 'Create non-system permissions',
  },
  {
    name: 'permissions:delete',
    resource: 'permissions',
    action: 'delete',
    description: 'Delete non-system permissions',
  },
  {
    name: 'permissions:assign',
    resource: 'permissions',
    action: 'assign',
    description: 'Attach/detach permissions on roles',
  },
  {
    name: 'profile:read:own',
    resource: 'profile',
    action: 'read',
    description: 'Read your own profile',
  },
  {
    name: 'profile:update:own',
    resource: 'profile',
    action: 'update',
    description: 'Update your own profile',
  },
  { name: 'files:upload', resource: 'files', action: 'upload', description: 'Upload a file' },
  { name: 'files:read:own', resource: 'files', action: 'read', description: 'Read your own files' },
  {
    name: 'files:delete:own',
    resource: 'files',
    action: 'delete',
    description: 'Delete your own files',
  },
  { name: 'audit:read', resource: 'audit', action: 'read', description: 'Read the audit log' },
  { name: 'logs:read', resource: 'logs', action: 'read', description: 'Read application logs' },
];

export const SYSTEM_ROLES: Array<{
  name: string;
  description: string;
  permissions: string[];
}> = [
  {
    name: 'SUPER_ADMIN',
    description: 'Full access including roles and permissions management',
    permissions: SYSTEM_PERMISSIONS.map((p) => p.name),
  },
  {
    name: 'ADMIN',
    description: 'Operates accounts and reads audit/logs; cannot edit RBAC structure',
    permissions: [
      'accounts:read',
      'accounts:create',
      'accounts:update',
      'accounts:disable',
      'accounts:delete',
      'roles:read',
      'roles:assign',
      'permissions:read',
      'audit:read',
      'logs:read',
      'profile:read:own',
      'profile:update:own',
      'files:upload',
      'files:read:own',
      'files:delete:own',
    ],
  },
  {
    name: 'USER',
    description: 'Standard end-user with self-service profile and files',
    permissions: [
      'profile:read:own',
      'profile:update:own',
      'files:upload',
      'files:read:own',
      'files:delete:own',
    ],
  },
];
