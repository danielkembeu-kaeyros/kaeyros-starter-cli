import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AccountKind } from '@prisma/client';
import { AdminAccountsService } from './admin-accounts.service';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequestUser } from '../../../common/authz/types';
import { Audit } from '../../audit/decorators/audit.decorator';
import { AuditAction } from '@prisma/client';
import { CreateAccountDto, SetAccountRolesDto, UpdateAccountDto } from './dto/admin-accounts.dto';

@ApiTags('Admin · Accounts')
@ApiBearerAuth('JWT')
@Controller('admin/accounts')
export class AdminAccountsController {
  constructor(private readonly service: AdminAccountsService) {}

  @RequirePermissions('accounts:read')
  @Get()
  @ApiOperation({ summary: 'List accounts (users + admins)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'kind', required: false, enum: AccountKind })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Paginated list of accounts with their roles.' })
  list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('kind', new ParseEnumPipe(AccountKind, { optional: true })) kind?: AccountKind,
    @Query('search') search?: string,
  ) {
    return this.service.list({ page, limit, kind, search });
  }

  @RequirePermissions('accounts:read')
  @Get(':id')
  @ApiOperation({ summary: 'Get one account by id' })
  @ApiResponse({ status: 200, description: 'The account with its roles.' })
  @ApiResponse({ status: 404, description: 'Account not found.' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @RequirePermissions('accounts:create')
  @Audit({ action: AuditAction.ACCOUNT_CREATED, resource: 'account' })
  @Post()
  @ApiOperation({
    summary: 'Create a USER or ADMIN account (admin invite email is sent for non-USER)',
  })
  @ApiResponse({ status: 201, description: 'The created account.' })
  @ApiResponse({ status: 409, description: 'An account with this email already exists.' })
  create(@Body() dto: CreateAccountDto, @CurrentUser() actor: RequestUser) {
    return this.service.create(dto, actor);
  }

  @RequirePermissions('accounts:update')
  @Patch(':id')
  @ApiOperation({ summary: 'Update profile fields or active status' })
  @ApiResponse({ status: 200, description: 'The updated account.' })
  @ApiResponse({ status: 404, description: 'Account not found.' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.service.update(id, dto, actor);
  }

  @RequirePermissions('accounts:disable')
  @Audit({ action: AuditAction.ACCOUNT_DISABLED, resource: 'account' })
  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable the account and revoke all refresh tokens' })
  @ApiResponse({ status: 200, description: 'The disabled account.' })
  @ApiResponse({ status: 404, description: 'Account not found.' })
  disable(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    return this.service.disable(id, actor);
  }

  @RequirePermissions('accounts:disable')
  @Audit({ action: AuditAction.ACCOUNT_ENABLED, resource: 'account' })
  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-enable a disabled account' })
  @ApiResponse({ status: 200, description: 'The re-enabled account.' })
  @ApiResponse({ status: 404, description: 'Account not found.' })
  enable(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    return this.service.enable(id, actor);
  }

  @RequirePermissions('accounts:delete')
  @Audit({ action: AuditAction.ACCOUNT_DELETED, resource: 'account' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Hard-delete the account row' })
  @ApiResponse({ status: 204, description: 'Account deleted.' })
  @ApiResponse({ status: 404, description: 'Account not found.' })
  async remove(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    await this.service.hardDelete(id, actor);
  }

  @RequirePermissions('roles:assign')
  @Audit({ action: AuditAction.ROLE_GRANTED, resource: 'account' })
  @Put(':id/roles')
  @ApiOperation({ summary: 'Replace the account roles' })
  @ApiResponse({ status: 200, description: 'The account with its updated roles.' })
  @ApiResponse({ status: 404, description: 'Account or role not found.' })
  setRoles(
    @Param('id') id: string,
    @Body() dto: SetAccountRolesDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.service.setRoles(id, dto, actor);
  }
}
