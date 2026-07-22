import { PrismaClient } from '@prisma/client';
import { SYSTEM_PERMISSIONS, SYSTEM_ROLES } from './rbac-catalogue';

/**
 * Idempotently seed the system permissions + roles into the test database.
 * Safe to call repeatedly; `resetData` preserves these rows between specs so in
 * practice this runs once via the jest globalSetup.
 *
 * Accepts any PrismaClient-shaped object (the e2e PrismaService or a bare
 * client used by globalSetup).
 */
export async function seedRbac(prisma: PrismaClient): Promise<void> {
  for (const p of SYSTEM_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name: p.name },
      create: { ...p, isSystem: true },
      update: {
        resource: p.resource,
        action: p.action,
        description: p.description,
        isSystem: true,
      },
    });
  }

  for (const r of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
      where: { name: r.name },
      create: { name: r.name, description: r.description, isSystem: true, createdBy: 'test' },
      update: { description: r.description, isSystem: true },
    });

    const permissions = await prisma.permission.findMany({
      where: { name: { in: r.permissions } },
      select: { id: true },
    });

    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }
  }
}
