import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotFoundException } from '../../common/exceptions/custom-exceptions';
import { PublicUserDto } from './dto/public-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

interface ListUsersOptions {
  page?: number;
  limit?: number;
  search?: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists end-users via the public_users view. The view's WHERE clause
   * guarantees that admin/super-admin accounts are excluded — there is no
   * SQL path against PublicUser that returns them.
   */
  async listPublicUsers(opts: ListUsersOptions): Promise<{
    data: PublicUserDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const offset = (page - 1) * limit;

    const where = opts.search
      ? {
          OR: [
            { firstName: { contains: opts.search, mode: 'insensitive' as const } },
            { lastName: { contains: opts.search, mode: 'insensitive' as const } },
            { email: { contains: opts.search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.publicUser.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.publicUser.count({ where }),
    ]);

    return { data: rows, total, page, limit };
  }

  async findPublicUser(id: string): Promise<PublicUserDto> {
    const user = await this.prisma.publicUser.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * Returns the signed-in caller's profile. Works for any account kind
   * (USER, ADMIN, SUPER_ADMIN) — /users/me is a self endpoint.
   */
  async getOwnProfile(accountId: string): Promise<{
    id: string;
    email: string;
    kind: string;
    isEmailVerified: boolean;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    avatar: string | null;
    bio: string | null;
    createdAt: Date;
  }> {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, deletedAt: null },
      include: { profile: true },
    });
    if (!account) throw new NotFoundException('Account not found');
    return {
      id: account.id,
      email: account.email,
      kind: account.kind,
      isEmailVerified: account.isEmailVerified,
      firstName: account.profile?.firstName ?? null,
      lastName: account.profile?.lastName ?? null,
      phone: account.profile?.phone ?? null,
      avatar: account.profile?.avatar ?? null,
      bio: account.profile?.bio ?? null,
      createdAt: account.createdAt,
    };
  }

  async updateOwnProfile(accountId: string, dto: UpdateProfileDto): Promise<void> {
    await this.prisma.profile.update({
      where: { accountId },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.bio !== undefined && { bio: dto.bio }),
      },
    });
  }
}
