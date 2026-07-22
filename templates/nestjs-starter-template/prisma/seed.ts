/**
 * Database seed
 * -------------
 * Idempotent: re-run as often as you like.
 *
 * Seeds:
 *  - System permissions  (resource:action)
 *  - System roles        (SUPER_ADMIN, ADMIN, USER) with their permission grants
 *  - One SUPER_ADMIN account on first run, sourced from env vars:
 *        INITIAL_SUPER_ADMIN_EMAIL
 *        INITIAL_SUPER_ADMIN_PASSWORD
 *    The seeded account is created with isEmailVerified=true and
 *    mustChangePassword=true — the operator must change the password on
 *    first login.
 *
 * No credentials are hardcoded anywhere in this file. If the env vars are
 * missing on a database with no existing SUPER_ADMIN, the script exits
 * with a non-zero status and a clear message.
 */
import { PrismaClient, AccountKind } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Permission catalogue
// ---------------------------------------------------------------------------
// Naming: <resource>:<action> — :own suffix marks own-resource scope (paired
// with @CheckOwnership on the route).
const SYSTEM_PERMISSIONS: Array<{
  name: string;
  resource: string;
  action: string;
  description: string;
}> = [
  // Accounts (super admin / admin)
  { name: 'accounts:read', resource: 'accounts', action: 'read', description: 'List/read any account' },
  { name: 'accounts:create', resource: 'accounts', action: 'create', description: 'Create accounts (users or admins)' },
  { name: 'accounts:update', resource: 'accounts', action: 'update', description: 'Update any account' },
  { name: 'accounts:disable', resource: 'accounts', action: 'disable', description: 'Disable or re-enable accounts' },
  { name: 'accounts:delete', resource: 'accounts', action: 'delete', description: 'Soft-delete accounts' },

  // Roles (super admin)
  { name: 'roles:read', resource: 'roles', action: 'read', description: 'List/read roles' },
  { name: 'roles:create', resource: 'roles', action: 'create', description: 'Create roles' },
  { name: 'roles:update', resource: 'roles', action: 'update', description: 'Update non-system roles' },
  { name: 'roles:delete', resource: 'roles', action: 'delete', description: 'Delete non-system roles' },
  { name: 'roles:assign', resource: 'roles', action: 'assign', description: 'Grant/revoke roles on accounts' },

  // Permissions (super admin)
  { name: 'permissions:read', resource: 'permissions', action: 'read', description: 'List/read permissions' },
  { name: 'permissions:create', resource: 'permissions', action: 'create', description: 'Create non-system permissions' },
  { name: 'permissions:delete', resource: 'permissions', action: 'delete', description: 'Delete non-system permissions' },
  { name: 'permissions:assign', resource: 'permissions', action: 'assign', description: 'Attach/detach permissions on roles' },

  // Profile (any signed-in user, scoped via :own + @CheckOwnership)
  { name: 'profile:read:own', resource: 'profile', action: 'read', description: 'Read your own profile' },
  { name: 'profile:update:own', resource: 'profile', action: 'update', description: 'Update your own profile' },

  // Files
  { name: 'files:upload', resource: 'files', action: 'upload', description: 'Upload a file' },
  { name: 'files:read:own', resource: 'files', action: 'read', description: 'Read your own files' },
  { name: 'files:delete:own', resource: 'files', action: 'delete', description: 'Delete your own files' },

  // Audit + application logs (admin/super-admin)
  { name: 'audit:read', resource: 'audit', action: 'read', description: 'Read the audit log' },
  { name: 'logs:read', resource: 'logs', action: 'read', description: 'Read application logs' },
];

// ---------------------------------------------------------------------------
// Role catalogue
// ---------------------------------------------------------------------------
const SYSTEM_ROLES: Array<{
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertStrongPassword(password: string): void {
  const rules = [
    { ok: password.length >= 10, message: 'at least 10 characters' },
    { ok: /[a-z]/.test(password), message: 'at least one lowercase letter' },
    { ok: /[A-Z]/.test(password), message: 'at least one uppercase letter' },
    { ok: /[0-9]/.test(password), message: 'at least one digit' },
    { ok: /[^A-Za-z0-9]/.test(password), message: 'at least one symbol' },
  ];
  const failures = rules.filter((r) => !r.ok).map((r) => r.message);
  if (failures.length > 0) {
    throw new Error(
      `INITIAL_SUPER_ADMIN_PASSWORD does not meet the policy: ${failures.join(', ')}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Seed steps
// ---------------------------------------------------------------------------

async function seedPermissions() {
  for (const p of SYSTEM_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name: p.name },
      create: { ...p, isSystem: true },
      update: { resource: p.resource, action: p.action, description: p.description, isSystem: true },
    });
  }
}

async function seedRoles() {
  for (const r of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
      where: { name: r.name },
      create: {
        name: r.name,
        description: r.description,
        isSystem: true,
        createdBy: 'system',
      },
      update: { description: r.description, isSystem: true },
    });

    const permissions = await prisma.permission.findMany({
      where: { name: { in: r.permissions } },
      select: { id: true, name: true },
    });

    if (permissions.length !== r.permissions.length) {
      const found = new Set(permissions.map((p) => p.name));
      const missing = r.permissions.filter((n) => !found.has(n));
      throw new Error(`Permissions missing for role ${r.name}: ${missing.join(', ')}`);
    }

    // Detach permissions no longer in the role catalogue, attach the rest idempotently.
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permissionId: { notIn: permissions.map((p) => p.id) },
      },
    });

    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }
  }
}

async function seedSuperAdmin() {
  const existing = await prisma.account.findFirst({
    where: { kind: AccountKind.SUPER_ADMIN, deletedAt: null },
    select: { id: true, email: true },
  });

  if (existing) {
    return { skipped: true as const, email: existing.email };
  }

  const email = process.env.INITIAL_SUPER_ADMIN_EMAIL?.trim();
  const password = process.env.INITIAL_SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'No SUPER_ADMIN exists and INITIAL_SUPER_ADMIN_EMAIL / INITIAL_SUPER_ADMIN_PASSWORD are not set.\n' +
        'Set both env vars and re-run `npm run db:seed`.',
    );
  }

  assertStrongPassword(password);

  const passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS || '12', 10));

  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'SUPER_ADMIN' } });

  await prisma.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: {
        email,
        password: passwordHash,
        kind: AccountKind.SUPER_ADMIN,
        isActive: true,
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        mustChangePassword: true,
        createdBy: 'seed',
      },
    });

    await tx.profile.create({
      data: {
        accountId: account.id,
      },
    });

    await tx.accountRole.create({
      data: {
        accountId: account.id,
        roleId: superAdminRole.id,
        grantedBy: 'seed',
      },
    });
  });

  return { skipped: false as const, email };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main() {
  await seedPermissions();
  await seedRoles();
  const result = await seedSuperAdmin();

  // eslint-disable-next-line no-console
  console.log('Seeding complete.');
  // eslint-disable-next-line no-console
  console.log(`  permissions: ${SYSTEM_PERMISSIONS.length}`);
  // eslint-disable-next-line no-console
  console.log(`  roles:       ${SYSTEM_ROLES.length}`);
  if (result.skipped) {
    // eslint-disable-next-line no-console
    console.log(`  super admin: already provisioned (${result.email}), no change.`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`  super admin: created (${result.email}). mustChangePassword=true.`);
  }
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('Seeding failed:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
