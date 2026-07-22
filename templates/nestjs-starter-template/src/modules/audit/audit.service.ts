import { Injectable } from '@nestjs/common';
import { AuditAction, AuditStatus, Prisma } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../database/prisma.service';
import { LoggerService } from '../../common/logging/logger.service';

export interface AuditEntry {
  action: AuditAction;
  actorAccountId?: string;
  actorEmail?: string;
  resource?: string;
  resourceId?: string;
  status?: AuditStatus;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
}

interface ListOptions {
  page: number;
  limit: number;
  action?: AuditAction;
  actorAccountId?: string;
  status?: AuditStatus;
  from?: Date;
  to?: Date;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Persist one audit row. Failure is logged but never thrown — losing
   * the audit row must not break the underlying request.
   */
  async log(entry: AuditEntry, request?: Request): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          actorAccountId: entry.actorAccountId ?? null,
          actorEmail: entry.actorEmail ?? null,
          resource: entry.resource ?? null,
          resourceId: entry.resourceId ?? null,
          status: entry.status ?? AuditStatus.SUCCESS,
          metadata: entry.metadata ?? Prisma.JsonNull,
          ipAddress: entry.ipAddress ?? request?.ip ?? null,
          userAgent: entry.userAgent ?? request?.get('user-agent') ?? null,
        },
      });
    } catch (e) {
      this.logger.error(
        `Failed to persist audit entry for action ${entry.action}`,
        e instanceof Error ? e.stack : undefined,
        'AuditService',
      );
    }
  }

  async list(opts: ListOptions) {
    const where: Prisma.AuditLogWhereInput = {
      ...(opts.action && { action: opts.action }),
      ...(opts.actorAccountId && { actorAccountId: opts.actorAccountId }),
      ...(opts.status && { status: opts.status }),
      ...((opts.from || opts.to) && {
        createdAt: {
          ...(opts.from && { gte: opts.from }),
          ...(opts.to && { lte: opts.to }),
        },
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, total, page: opts.page, limit: opts.limit };
  }
}
