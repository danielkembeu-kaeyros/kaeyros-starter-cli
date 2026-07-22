import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminPermissionsService } from './admin-permissions.service';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Audit } from '../../audit/decorators/audit.decorator';
import { AuditAction } from '@prisma/client';
import { CreatePermissionDto } from './dto/admin-permissions.dto';

@ApiTags('Admin · Permissions')
@ApiBearerAuth('JWT')
@Controller('admin/permissions')
export class AdminPermissionsController {
  constructor(private readonly service: AdminPermissionsService) {}

  @RequirePermissions('permissions:read')
  @Get()
  @ApiOperation({ summary: 'List permissions' })
  @ApiResponse({ status: 200, description: 'All permissions.' })
  list() {
    return this.service.list();
  }

  @RequirePermissions('permissions:read')
  @Get(':id')
  @ApiOperation({ summary: 'Get a permission by id' })
  @ApiResponse({ status: 200, description: 'The permission.' })
  @ApiResponse({ status: 404, description: 'Permission not found.' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @RequirePermissions('permissions:create')
  @Audit({ action: AuditAction.PERMISSION_CREATED, resource: 'permission' })
  @Post()
  @ApiOperation({ summary: 'Create a non-system permission' })
  @ApiResponse({ status: 201, description: 'The created permission.' })
  @ApiResponse({ status: 409, description: 'A permission with this name already exists.' })
  create(@Body() dto: CreatePermissionDto) {
    return this.service.create(dto);
  }

  @RequirePermissions('permissions:delete')
  @Audit({ action: AuditAction.PERMISSION_DELETED, resource: 'permission' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a non-system permission' })
  @ApiResponse({ status: 204, description: 'Permission deleted.' })
  @ApiResponse({ status: 404, description: 'Permission not found.' })
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
  }
}
