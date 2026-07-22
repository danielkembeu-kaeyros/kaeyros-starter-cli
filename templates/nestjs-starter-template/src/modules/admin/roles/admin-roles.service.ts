import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../../common/exceptions/custom-exceptions';
import { CreateRoleDto, SetRolePermissionsDto, UpdateRoleDto } from './dto/admin-roles.dto';

@Injectable()
export class AdminRolesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.role.findMany({
      where: { deletedAt: null },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: { permissions: { include: { permission: true } } },
    });
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, deletedAt: null },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async create(dto: CreateRoleDto, actorId: string) {
    if (dto.permissionIds?.length) {
      await this.assertPermissionsExist(dto.permissionIds);
    }
    const existing = await this.prisma.role.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException('Role with this name already exists');

    const role = await this.prisma.$transaction(async (tx) => {
      const r = await tx.role.create({
        data: {
          name: dto.name,
          description: dto.description,
          createdBy: actorId,
        },
      });
      if (dto.permissionIds?.length) {
        await tx.rolePermission.createMany({
          data: dto.permissionIds.map((permissionId) => ({ roleId: r.id, permissionId })),
        });
      }
      return r;
    });
    return this.findOne(role.id);
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.prisma.role.findFirst({ where: { id, deletedAt: null } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new ForbiddenException('System roles cannot be modified');
    if (dto.name && dto.name !== role.name) {
      const collision = await this.prisma.role.findUnique({ where: { name: dto.name } });
      if (collision) throw new ConflictException('Role with this name already exists');
    }
    await this.prisma.role.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });
    return this.findOne(id);
  }

  async remove(id: string) {
    const role = await this.prisma.role.findFirst({ where: { id, deletedAt: null } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new ForbiddenException('System roles cannot be deleted');
    await this.prisma.role.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async setPermissions(id: string, dto: SetRolePermissionsDto) {
    const role = await this.prisma.role.findFirst({ where: { id, deletedAt: null } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new ForbiddenException('System role permissions are read-only');
    await this.assertPermissionsExist(dto.permissionIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (dto.permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: dto.permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
        });
      }
    });

    return this.findOne(id);
  }

  private async assertPermissionsExist(ids: string[]) {
    const found = await this.prisma.permission.count({ where: { id: { in: ids } } });
    if (found !== ids.length) {
      throw new BadRequestException('One or more permissions do not exist');
    }
  }
}
