import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminPermissionsService } from '../admin-permissions.service';
import { PrismaService } from '../../../database/prisma.service';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../../../common/exceptions/custom-exceptions';

describe('AdminPermissionsService', () => {
  let module: TestingModule;
  let service: AdminPermissionsService;

  const mockPrisma = {
    permission: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [AdminPermissionsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<AdminPermissionsService>(AdminPermissionsService);
  });

  afterEach(async () => {
    if (module) await module.close();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('list', () => {
    it('returns permissions ordered', () => {
      const perms = [{ id: 'p1' }];
      mockPrisma.permission.findMany.mockReturnValue(perms);

      const result = service.list();

      expect(result).toBe(perms);
      expect(mockPrisma.permission.findMany).toHaveBeenCalledWith({
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      });
    });
  });

  describe('findOne', () => {
    it('returns the permission when found', async () => {
      const p = { id: 'p1' };
      mockPrisma.permission.findUnique.mockResolvedValue(p);
      await expect(service.findOne('p1')).resolves.toBe(p);
      expect(mockPrisma.permission.findUnique).toHaveBeenCalledWith({ where: { id: 'p1' } });
    });

    it('throws NotFoundException when missing', async () => {
      mockPrisma.permission.findUnique.mockResolvedValue(null);
      await expect(service.findOne('p1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates a new permission', async () => {
      mockPrisma.permission.findUnique.mockResolvedValue(null);
      const created = { id: 'p1', name: 'users:read' };
      mockPrisma.permission.create.mockResolvedValue(created);

      const result = await service.create({
        name: 'users:read',
        resource: 'users',
        action: 'read',
        description: 'd',
      } as any);

      expect(result).toBe(created);
      expect(mockPrisma.permission.create).toHaveBeenCalledWith({
        data: { name: 'users:read', resource: 'users', action: 'read', description: 'd' },
      });
    });

    it('throws ConflictException on duplicate name', async () => {
      mockPrisma.permission.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.create({ name: 'dup' } as any)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(mockPrisma.permission.create).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes a non-system permission', async () => {
      mockPrisma.permission.findUnique.mockResolvedValue({ id: 'p1', isSystem: false });
      mockPrisma.permission.delete.mockResolvedValue({});

      await service.remove('p1');

      expect(mockPrisma.permission.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    });

    it('throws NotFoundException when missing', async () => {
      mockPrisma.permission.findUnique.mockResolvedValue(null);
      await expect(service.remove('p1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to delete a system permission', async () => {
      mockPrisma.permission.findUnique.mockResolvedValue({ id: 'p1', isSystem: true });
      await expect(service.remove('p1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.permission.delete).not.toHaveBeenCalled();
    });
  });
});
