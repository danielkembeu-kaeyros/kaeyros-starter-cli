import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminRolesService } from '../admin-roles.service';
import { PrismaService } from '../../../database/prisma.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../../../common/exceptions/custom-exceptions';

describe('AdminRolesService', () => {
  let module: TestingModule;
  let service: AdminRolesService;

  const txMock = {
    role: { create: jest.fn() },
    rolePermission: { createMany: jest.fn(), deleteMany: jest.fn() },
  };

  const mockPrisma = {
    role: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    rolePermission: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    permission: {
      count: jest.fn(),
    },
    // callback form
    $transaction: jest.fn(async (cb: (tx: typeof txMock) => unknown) => cb(txMock)),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [AdminRolesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<AdminRolesService>(AdminRolesService);
  });

  afterEach(async () => {
    if (module) await module.close();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('list', () => {
    it('returns non-deleted roles ordered', () => {
      const roles = [{ id: 'r1' }];
      mockPrisma.role.findMany.mockReturnValue(roles);

      const result = service.list();

      expect(result).toBe(roles);
      expect(mockPrisma.role.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: null } }),
      );
    });
  });

  describe('findOne', () => {
    it('returns a role when found', async () => {
      const role = { id: 'r1' };
      mockPrisma.role.findFirst.mockResolvedValue(role);
      await expect(service.findOne('r1')).resolves.toBe(role);
    });

    it('throws NotFoundException when missing', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);
      await expect(service.findOne('r1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates a role with permissions and returns the reloaded entity', async () => {
      mockPrisma.permission.count.mockResolvedValue(2);
      mockPrisma.role.findUnique.mockResolvedValue(null);
      txMock.role.create.mockResolvedValue({ id: 'new' });
      txMock.rolePermission.createMany.mockResolvedValue({ count: 2 });
      mockPrisma.role.findFirst.mockResolvedValue({ id: 'new' });

      const result = await service.create(
        { name: 'Editor', description: 'd', permissionIds: ['p1', 'p2'] } as any,
        'actor1',
      );

      expect(result).toEqual({ id: 'new' });
      expect(txMock.role.create).toHaveBeenCalledWith({
        data: { name: 'Editor', description: 'd', createdBy: 'actor1' },
      });
      expect(txMock.rolePermission.createMany).toHaveBeenCalledWith({
        data: [
          { roleId: 'new', permissionId: 'p1' },
          { roleId: 'new', permissionId: 'p2' },
        ],
      });
    });

    it('throws BadRequestException when permissions do not all exist', async () => {
      mockPrisma.permission.count.mockResolvedValue(1);
      await expect(
        service.create({ name: 'X', permissionIds: ['p1', 'p2'] } as any, 'actor1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ConflictException on duplicate name', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.create({ name: 'Dup' } as any, 'actor1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('update', () => {
    it('updates a non-system role', async () => {
      mockPrisma.role.findFirst.mockResolvedValueOnce({ id: 'r1', isSystem: false, name: 'Old' });
      mockPrisma.role.findUnique.mockResolvedValue(null);
      mockPrisma.role.update.mockResolvedValue({});
      mockPrisma.role.findFirst.mockResolvedValueOnce({ id: 'r1' });

      const result = await service.update('r1', { name: 'New', description: 'x' } as any);

      expect(result).toEqual({ id: 'r1' });
      expect(mockPrisma.role.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { name: 'New', description: 'x' },
      });
    });

    it('throws NotFoundException when role missing', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);
      await expect(service.update('r1', { name: 'X' } as any)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses to modify a system role', async () => {
      mockPrisma.role.findFirst.mockResolvedValue({ id: 'r1', isSystem: true, name: 'Sys' });
      await expect(service.update('r1', { name: 'X' } as any)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws ConflictException when renaming to a taken name', async () => {
      mockPrisma.role.findFirst.mockResolvedValue({ id: 'r1', isSystem: false, name: 'Old' });
      mockPrisma.role.findUnique.mockResolvedValue({ id: 'other' });
      await expect(service.update('r1', { name: 'Taken' } as any)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes a non-system role', async () => {
      mockPrisma.role.findFirst.mockResolvedValue({ id: 'r1', isSystem: false });
      mockPrisma.role.update.mockResolvedValue({});

      await service.remove('r1');

      expect(mockPrisma.role.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('throws NotFoundException when role missing', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);
      await expect(service.remove('r1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to delete a system role', async () => {
      mockPrisma.role.findFirst.mockResolvedValue({ id: 'r1', isSystem: true });
      await expect(service.remove('r1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.role.update).not.toHaveBeenCalled();
    });
  });

  describe('setPermissions', () => {
    it('replaces permissions for a non-system role', async () => {
      mockPrisma.role.findFirst.mockResolvedValueOnce({ id: 'r1', isSystem: false });
      mockPrisma.permission.count.mockResolvedValue(2);
      txMock.rolePermission.deleteMany.mockResolvedValue({ count: 1 });
      txMock.rolePermission.createMany.mockResolvedValue({ count: 2 });
      mockPrisma.role.findFirst.mockResolvedValueOnce({ id: 'r1' });

      const result = await service.setPermissions('r1', { permissionIds: ['p1', 'p2'] } as any);

      expect(result).toEqual({ id: 'r1' });
      expect(txMock.rolePermission.deleteMany).toHaveBeenCalledWith({ where: { roleId: 'r1' } });
      expect(txMock.rolePermission.createMany).toHaveBeenCalledWith({
        data: [
          { roleId: 'r1', permissionId: 'p1' },
          { roleId: 'r1', permissionId: 'p2' },
        ],
      });
    });

    it('throws NotFoundException when role missing', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);
      await expect(
        service.setPermissions('r1', { permissionIds: [] } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses on a system role', async () => {
      mockPrisma.role.findFirst.mockResolvedValue({ id: 'r1', isSystem: true });
      await expect(
        service.setPermissions('r1', { permissionIds: [] } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
