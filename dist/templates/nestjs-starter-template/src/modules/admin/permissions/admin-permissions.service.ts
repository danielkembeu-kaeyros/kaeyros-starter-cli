import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../../common/exceptions/custom-exceptions';
import { CreatePermissionDto } from './dto/admin-permissions.dto';

@Injectable()
export class AdminPermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.permission.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const p = await this.prisma.permission.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Permission not found');
    return p;
  }

  async create(dto: CreatePermissionDto) {
    const existing = await this.prisma.permission.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException('Permission with this name already exists');
    return this.prisma.permission.create({
      data: {
        name: dto.name,
        resource: dto.resource,
        action: dto.action,
        description: dto.description,
      },
    });
  }

  async remove(id: string) {
    const p = await this.prisma.permission.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Permission not found');
    if (p.isSystem) throw new ForbiddenException('System permissions cannot be deleted');
    await this.prisma.permission.delete({ where: { id } });
  }
}
