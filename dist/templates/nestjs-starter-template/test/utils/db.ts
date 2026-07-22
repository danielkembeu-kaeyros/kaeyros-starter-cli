import { PrismaClient } from '@prisma/client';

/**
 * Mutable tables wiped between specs. RBAC structure (roles, permissions,
 * role_permissions) is intentionally preserved — it is seeded once and shared.
 * TRUNCATE ... CASCADE clears dependent rows; RESTART IDENTITY resets sequences.
 */
const MUTABLE_TABLES = [
  'audit_logs',
  'logs',
  'files',
  'login_otps',
  'email_verifications',
  'password_resets',
  'refresh_tokens',
  'account_roles',
  'profiles',
  'accounts',
];

/**
 * Truncate all per-test data so each spec starts from a clean slate while
 * keeping the seeded RBAC catalogue intact.
 */
export async function resetData(prisma: PrismaClient): Promise<void> {
  const list = MUTABLE_TABLES.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
  // Drop non-system roles/permissions created by tests (their role_permissions
  // rows cascade away). The seeded system catalogue is left untouched.
  await prisma.$executeRawUnsafe(`DELETE FROM "roles" WHERE "isSystem" = false;`);
  await prisma.$executeRawUnsafe(`DELETE FROM "permissions" WHERE "isSystem" = false;`);
}
