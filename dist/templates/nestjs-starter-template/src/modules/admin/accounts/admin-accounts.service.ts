import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountKind, LoginMethod, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { EmailService } from '../../email/email.service';
import { LoggerService } from '../../../common/logging/logger.service';
import { RequestUser } from '../../../common/authz/types';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../../common/exceptions/custom-exceptions';
import { CreateAccountDto, SetAccountRolesDto, UpdateAccountDto } from './dto/admin-accounts.dto';

@Injectable()
export class AdminAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly emailService: EmailService,
  ) {}

  async list(opts: { page: number; limit: number; kind?: AccountKind; search?: string }) {
    const where: Prisma.AccountWhereInput = {
      deletedAt: null,
      ...(opts.kind && { kind: opts.kind }),
      ...(opts.search && {
        OR: [
          { email: { contains: opts.search, mode: 'insensitive' } },
          { profile: { firstName: { contains: opts.search, mode: 'insensitive' } } },
          { profile: { lastName: { contains: opts.search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.account.findMany({
        where,
        include: { profile: true, accountRoles: { include: { role: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
      }),
      this.prisma.account.count({ where }),
    ]);

    return { data: data.map((a) => this.project(a)), total, page: opts.page, limit: opts.limit };
  }

  async findOne(id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, deletedAt: null },
      include: { profile: true, accountRoles: { include: { role: true } } },
    });
    if (!account) throw new NotFoundException('Account not found');
    return this.project(account);
  }

  async create(dto: CreateAccountDto, actor: RequestUser) {
    if (dto.kind === AccountKind.SUPER_ADMIN && actor.kind !== AccountKind.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admins can create another super admin');
    }

    const existing = await this.prisma.account.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');

    if (dto.roleIds?.length) {
      await this.assertRolesExistAndAreAssignable(dto.roleIds, actor);
    }

    const loginMethod = dto.loginMethod ?? LoginMethod.PASSWORD;
    const otpOnly = loginMethod === LoginMethod.OTP;
    // PASSWORD or BOTH: real temp password the new user receives by email.
    // OTP only: random unguessable hash that is never sent — the account
    // signs in via /auth/login/request-otp.
    const temporaryPassword = otpOnly ? null : generateTemporaryPassword();
    const rounds = this.configService.get<number>('security.bcryptRounds', 12);
    const passwordHash = otpOnly
      ? await bcrypt.hash(crypto.randomBytes(32).toString('hex'), rounds)
      : await bcrypt.hash(temporaryPassword as string, rounds);

    const account = await this.prisma.$transaction(async (tx) => {
      const a = await tx.account.create({
        data: {
          email: dto.email,
          password: passwordHash,
          kind: dto.kind,
          isEmailVerified: true,
          emailVerifiedAt: new Date(),
          // OTP-only admins have no temp password to rotate, so the lockout
          // doesn't apply. PASSWORD and BOTH still funnel through the
          // change-initial-password flow.
          mustChangePassword: !otpOnly,
          loginMethod,
          createdBy: actor.id,
        },
      });
      await tx.profile.create({
        data: { accountId: a.id, firstName: dto.firstName, lastName: dto.lastName },
      });
      if (dto.roleIds?.length) {
        await tx.accountRole.createMany({
          data: dto.roleIds.map((roleId) => ({ accountId: a.id, roleId, grantedBy: actor.id })),
        });
      }
      return a;
    });

    if (dto.kind !== AccountKind.USER) {
      const frontendUrl = this.configService.get<string>(
        'app.frontendUrl',
        'http://localhost:3000',
      );
      const fullName = [dto.firstName, dto.lastName].filter(Boolean).join(' ') || undefined;

      const result = otpOnly
        ? await this.emailService.sendOtpAdminInviteEmail(account.email, {
            userName: fullName,
            invitedBy: actor.email,
          })
        : await this.emailService.sendEmail({
            to: account.email,
            subject: 'Your administrator account',
            template: 'admin-invite',
            context: {
              email: account.email,
              temporaryPassword,
              userName: fullName ?? null,
              invitedBy: actor.email,
              loginUrl: `${frontendUrl}/login`,
            },
          });
      if (!result.success) {
        this.logger.error(
          `Failed to send admin invite to ${account.email}`,
          undefined,
          'AdminAccountsService',
        );
      }
    }

    return this.findOne(account.id);
  }

  async update(id: string, dto: UpdateAccountDto, actor: RequestUser) {
    const account = await this.prisma.account.findFirst({
      where: { id, deletedAt: null },
      include: { profile: true },
    });
    if (!account) throw new NotFoundException('Account not found');
    if (account.kind === AccountKind.SUPER_ADMIN && actor.kind !== AccountKind.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admins can update another super admin');
    }

    const profileData: Prisma.ProfileUpdateInput = {};
    if (dto.firstName !== undefined) profileData.firstName = dto.firstName;
    if (dto.lastName !== undefined) profileData.lastName = dto.lastName;
    if (dto.phone !== undefined) profileData.phone = dto.phone;
    if (dto.bio !== undefined) profileData.bio = dto.bio;

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(profileData).length > 0) {
        await tx.profile.update({ where: { accountId: id }, data: profileData });
      }
      if (dto.isActive !== undefined || dto.loginMethod !== undefined) {
        await tx.account.update({
          where: { id },
          data: {
            ...(dto.isActive !== undefined && { isActive: dto.isActive }),
            ...(dto.loginMethod !== undefined && { loginMethod: dto.loginMethod }),
            updatedBy: actor.id,
            ...(dto.isActive === false && { lockedUntil: null, failedLoginAttempts: 0 }),
          },
        });
        if (dto.isActive === false) {
          await tx.refreshToken.updateMany({
            where: { accountId: id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
      }
    });

    return this.findOne(id);
  }

  async disable(id: string, actor: RequestUser) {
    return this.update(id, { isActive: false }, actor);
  }

  async enable(id: string, actor: RequestUser) {
    return this.update(id, { isActive: true }, actor);
  }

  async hardDelete(id: string, actor: RequestUser) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Account not found');
    if (account.kind === AccountKind.SUPER_ADMIN && actor.kind !== AccountKind.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admins can delete another super admin');
    }
    if (account.id === actor.id) {
      throw new ForbiddenException('You cannot delete your own account');
    }
    await this.prisma.account.delete({ where: { id } });
  }

  async setRoles(id: string, dto: SetAccountRolesDto, actor: RequestUser) {
    const account = await this.prisma.account.findFirst({
      where: { id, deletedAt: null },
    });
    if (!account) throw new NotFoundException('Account not found');
    if (account.kind === AccountKind.SUPER_ADMIN && actor.kind !== AccountKind.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admins can manage another super admin');
    }
    await this.assertRolesExistAndAreAssignable(dto.roleIds, actor);

    await this.prisma.$transaction(async (tx) => {
      await tx.accountRole.deleteMany({ where: { accountId: id } });
      if (dto.roleIds.length > 0) {
        await tx.accountRole.createMany({
          data: dto.roleIds.map((roleId) => ({ accountId: id, roleId, grantedBy: actor.id })),
        });
      }
    });

    return this.findOne(id);
  }

  // ---------------------------------------------------------------------------

  private async assertRolesExistAndAreAssignable(roleIds: string[], actor: RequestUser) {
    const roles = await this.prisma.role.findMany({ where: { id: { in: roleIds } } });
    if (roles.length !== roleIds.length) {
      throw new BadRequestException('One or more roles do not exist');
    }
    if (actor.kind !== AccountKind.SUPER_ADMIN) {
      const superAdminRole = roles.find((r) => r.name === 'SUPER_ADMIN');
      if (superAdminRole) {
        throw new ForbiddenException('Only super admins can grant the SUPER_ADMIN role');
      }
    }
  }

  private project(account: {
    id: string;
    email: string;
    kind: AccountKind;
    isActive: boolean;
    isEmailVerified: boolean;
    mustChangePassword: boolean;
    loginMethod: LoginMethod;
    lastLoginAt: Date | null;
    createdAt: Date;
    profile: { firstName: string | null; lastName: string | null } | null;
    accountRoles: { role: { id: string; name: string } }[];
  }) {
    return {
      id: account.id,
      email: account.email,
      kind: account.kind,
      isActive: account.isActive,
      isEmailVerified: account.isEmailVerified,
      mustChangePassword: account.mustChangePassword,
      loginMethod: account.loginMethod,
      lastLoginAt: account.lastLoginAt,
      createdAt: account.createdAt,
      firstName: account.profile?.firstName ?? null,
      lastName: account.profile?.lastName ?? null,
      roles: account.accountRoles.map((ar) => ({ id: ar.role.id, name: ar.role.name })),
    };
  }
}

function generateTemporaryPassword(): string {
  const lowers = 'abcdefghijkmnpqrstuvwxyz'; // omit l, o to reduce ambiguity
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // omit I, O
  const digits = '23456789'; // omit 0, 1
  const symbols = '!@#$%^&*';
  const pool = lowers + uppers + digits + symbols;
  const picks = [
    pick(lowers),
    pick(lowers),
    pick(lowers),
    pick(uppers),
    pick(uppers),
    pick(digits),
    pick(digits),
    pick(symbols),
    pick(pool),
    pick(pool),
    pick(pool),
    pick(pool),
  ];
  return shuffle(picks).join('');
}

function pick(s: string): string {
  return s[crypto.randomInt(s.length)];
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
