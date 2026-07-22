import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminRolesService } from './admin-roles.service';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Audit } from '../../audit/decorators/audit.decorator';
import { AuditAction } from '@prisma/client';
import { CreateRoleDto, SetRolePermissionsDto, UpdateRoleDto } from './dto/admin-roles.dto';

@ApiTags('Admin · Roles')
@ApiBearerAuth('JWT')
@Controller('admin/roles')
export class AdminRolesController {
  constructor(private readonly service: AdminRolesService) {}

  @RequirePermissions('roles:read')
  @Get()
  @ApiOperation({ summary: 'List roles' })
  @ApiResponse({ status: 200, description: 'All active roles with their permissions.' })
  list() {
    return this.service.list();
  }

  @RequirePermissions('roles:read')
  @Get(':id')
  @ApiOperation({ summary: 'Get a role with its permissions' })
  @ApiResponse({ status: 200, description: 'The role with its permissions.' })
  @ApiResponse({ status: 404, description: 'Role not found.' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @RequirePermissions('roles:create')
  @Audit({ action: AuditAction.ROLE_CREATED, resource: 'role' })
  @Post()
  @ApiOperation({ summary: 'Create a non-system role' })
  @ApiResponse({ status: 201, description: 'The created role.' })
  @ApiResponse({ status: 409, description: 'A role with this name already exists.' })
  create(@Body() dto: CreateRoleDto, @CurrentUser('id') actorId: string) {
    return this.service.create(dto, actorId);
  }

  @RequirePermissions('roles:update')
  @Audit({ action: AuditAction.ROLE_UPDATED, resource: 'role' })
  @Patch(':id')
  @ApiOperation({ summary: 'Update name or description of a non-system role' })
  @ApiResponse({ status: 200, description: 'The updated role.' })
  @ApiResponse({ status: 404, description: 'Role not found.' })
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.service.update(id, dto);
  }

  @RequirePermissions('roles:delete')
  @Audit({ action: AuditAction.ROLE_DELETED, resource: 'role' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a non-system role' })
  @ApiResponse({ status: 204, description: 'Role deleted.' })
  @ApiResponse({ status: 404, description: 'Role not found.' })
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
  }

  @RequirePermissions('permissions:assign')
  @Audit({ action: AuditAction.PERMISSION_ASSIGNED, resource: 'role' })
  @Put(':id/permissions')
  @ApiOperation({ summary: 'Replace the permissions attached to a non-system role' })
  @ApiResponse({ status: 200, description: 'The role with its updated permissions.' })
  @ApiResponse({ status: 404, description: 'Role or permission not found.' })
  setPermissions(@Param('id') id: string, @Body() dto: SetRolePermissionsDto) {
    return this.service.setPermissions(id, dto);
  }
}
