import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseEnumPipe,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuditAction, AuditStatus } from '@prisma/client';
import { AuditService } from './audit.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@ApiTags('Admin · Audit log')
@ApiBearerAuth('JWT')
@Controller('admin/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @RequirePermissions('audit:read')
  @Get()
  @ApiOperation({ summary: 'List audit log entries with optional filters' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'action', required: false, enum: AuditAction })
  @ApiQuery({ name: 'status', required: false, enum: AuditStatus })
  @ApiQuery({ name: 'actorAccountId', required: false, type: String })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'ISO 8601 datetime' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'ISO 8601 datetime' })
  @ApiResponse({ status: 200, description: 'Paginated audit log entries, newest first.' })
  list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('action', new ParseEnumPipe(AuditAction, { optional: true })) action?: AuditAction,
    @Query('status', new ParseEnumPipe(AuditStatus, { optional: true })) status?: AuditStatus,
    @Query('actorAccountId') actorAccountId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.auditService.list({
      page,
      limit: Math.min(200, Math.max(1, limit)),
      action,
      status,
      actorAccountId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }
}
