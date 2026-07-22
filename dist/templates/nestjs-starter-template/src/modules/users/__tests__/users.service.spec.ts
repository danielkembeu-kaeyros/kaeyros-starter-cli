import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../users.service';
import { PrismaService } from '../../database/prisma.service';
import { NotFoundException } from '../../../common/exceptions/custom-exceptions';

describe('UsersService', () => {
  let module: TestingModule;
  let service: UsersService;

  const mockPrisma = {
    publicUser: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    account: {
      findFirst: jest.fn(),
    },
    profile: {
      update: jest.fn(),
    },
    // array form: $transaction([...]) -> Promise.all
    $transaction: jest.fn(async (arr: Promise<unknown>[]) => Promise.all(arr)),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(async () => {
    if (module) await module.close();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listPublicUsers', () => {
    it('paginates with defaults and no search filter', async () => {
      const rows = [{ id: 'u1' }];
      mockPrisma.publicUser.findMany.mockResolvedValue(rows);
      mockPrisma.publicUser.count.mockResolvedValue(1);

      const result = await service.listPublicUsers({});

      expect(result).toEqual({ data: rows, total: 1, page: 1, limit: 20 });
      expect(mockPrisma.publicUser.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('applies search filter and clamps page/limit', async () => {
      mockPrisma.publicUser.findMany.mockResolvedValue([]);
      mockPrisma.publicUser.count.mockResolvedValue(0);

      await service.listPublicUsers({ page: 3, limit: 5, search: 'ann' });

      expect(mockPrisma.publicUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 5,
          where: {
            OR: [
              { firstName: { contains: 'ann', mode: 'insensitive' } },
              { lastName: { contains: 'ann', mode: 'insensitive' } },
              { email: { contains: 'ann', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });

    it('clamps limit to a maximum of 100 and page minimum of 1', async () => {
      mockPrisma.publicUser.findMany.mockResolvedValue([]);
      mockPrisma.publicUser.count.mockResolvedValue(0);

      await service.listPublicUsers({ page: 0, limit: 500 });

      expect(mockPrisma.publicUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 100 }),
      );
    });
  });

  describe('findPublicUser', () => {
    it('returns the user when found', async () => {
      const user = { id: 'u1', email: 'a@b.c' };
      mockPrisma.publicUser.findUnique.mockResolvedValue(user);

      await expect(service.findPublicUser('u1')).resolves.toBe(user);
      expect(mockPrisma.publicUser.findUnique).toHaveBeenCalledWith({ where: { id: 'u1' } });
    });

    it('throws NotFoundException when missing', async () => {
      mockPrisma.publicUser.findUnique.mockResolvedValue(null);

      await expect(service.findPublicUser('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getOwnProfile', () => {
    it('returns a flattened profile', async () => {
      const createdAt = new Date('2024-01-01');
      mockPrisma.account.findFirst.mockResolvedValue({
        id: 'a1',
        email: 'a@b.c',
        kind: 'USER',
        isEmailVerified: true,
        createdAt,
        profile: {
          firstName: 'Ann',
          lastName: 'Lee',
          phone: '123',
          avatar: 'av.png',
          bio: 'hi',
        },
      });

      const result = await service.getOwnProfile('a1');

      expect(result).toEqual({
        id: 'a1',
        email: 'a@b.c',
        kind: 'USER',
        isEmailVerified: true,
        firstName: 'Ann',
        lastName: 'Lee',
        phone: '123',
        avatar: 'av.png',
        bio: 'hi',
        createdAt,
      });
      expect(mockPrisma.account.findFirst).toHaveBeenCalledWith({
        where: { id: 'a1', deletedAt: null },
        include: { profile: true },
      });
    });

    it('nulls profile fields when profile is absent', async () => {
      mockPrisma.account.findFirst.mockResolvedValue({
        id: 'a1',
        email: 'a@b.c',
        kind: 'USER',
        isEmailVerified: false,
        createdAt: new Date(),
        profile: null,
      });

      const result = await service.getOwnProfile('a1');
      expect(result.firstName).toBeNull();
      expect(result.bio).toBeNull();
    });

    it('throws NotFoundException when account is missing', async () => {
      mockPrisma.account.findFirst.mockResolvedValue(null);
      await expect(service.getOwnProfile('a1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateOwnProfile', () => {
    it('updates only the provided fields', async () => {
      mockPrisma.profile.update.mockResolvedValue({});

      await service.updateOwnProfile('a1', { firstName: 'New', bio: 'b' } as any);

      expect(mockPrisma.profile.update).toHaveBeenCalledWith({
        where: { accountId: 'a1' },
        data: { firstName: 'New', bio: 'b' },
      });
    });

    it('passes an empty data object when nothing supplied', async () => {
      mockPrisma.profile.update.mockResolvedValue({});

      await service.updateOwnProfile('a1', {} as any);

      expect(mockPrisma.profile.update).toHaveBeenCalledWith({
        where: { accountId: 'a1' },
        data: {},
      });
    });
  });
});
