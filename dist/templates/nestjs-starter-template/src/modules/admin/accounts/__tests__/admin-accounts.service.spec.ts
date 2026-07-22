import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { AccountKind, LoginMethod } from '@prisma/client';
import { AdminAccountsService } from '../admin-accounts.service';
import { PrismaService } from '../../../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../../../common/logging/logger.service';
import { EmailService } from '../../../email/email.service';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../../../common/exceptions/custom-exceptions';

describe('AdminAccountsService', () => {
  let module: TestingModule;
  let service: AdminAccountsService;

  const txMock = {
    account: { create: jest.fn(), update: jest.fn() },
    profile: { create: jest.fn(), update: jest.fn() },
    accountRole: { createMany: jest.fn(), deleteMany: jest.fn() },
    refreshToken: { updateMany: jest.fn() },
  };

  const mockPrisma = {
    account: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
    role: { findMany: jest.fn() },
    // both forms used: list() passes an array, create/update/setRoles pass a callback.
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: typeof txMock) => unknown)(txMock)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  };

  const mockConfig = {
    get: jest.fn((key: string, def?: unknown) => {
      if (key === 'security.bcryptRounds') return 4;
      if (key === 'app.frontendUrl') return 'http://localhost:3000';
      return def;
    }),
  };

  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  const mockEmail = {
    sendEmail: jest.fn(),
    sendOtpAdminInviteEmail: jest.fn(),
  };

  const superActor = {
    id: 'super1',
    email: 'super@x.com',
    kind: AccountKind.SUPER_ADMIN,
  } as any;
  const adminActor = {
    id: 'admin1',
    email: 'admin@x.com',
    kind: AccountKind.ADMIN,
  } as any;

  const projectedAccount = {
    id: 'acc1',
    email: 'new@x.com',
    kind: AccountKind.ADMIN,
    isActive: true,
    isEmailVerified: true,
    mustChangePassword: true,
    loginMethod: LoginMethod.PASSWORD,
    lastLoginAt: null,
    createdAt: new Date(),
    profile: { firstName: 'N', lastName: 'U' },
    accountRoles: [],
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        AdminAccountsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: LoggerService, useValue: mockLogger },
        { provide: EmailService, useValue: mockEmail },
      ],
    }).compile();

    service = module.get<AdminAccountsService>(AdminAccountsService);
  });

  afterEach(async () => {
    if (module) await module.close();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('forbids a non-super-admin from creating a SUPER_ADMIN', async () => {
      await expect(
        service.create({ email: 'x@x.com', kind: AccountKind.SUPER_ADMIN } as any, adminActor),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ConflictException on a duplicate email', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({ id: 'dup' });
      await expect(
        service.create({ email: 'dup@x.com', kind: AccountKind.ADMIN } as any, superActor),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates an admin and sends an invite email', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null);
      txMock.account.create.mockResolvedValue({ id: 'acc1', email: 'new@x.com' });
      txMock.profile.create.mockResolvedValue({});
      mockEmail.sendEmail.mockResolvedValue({ success: true });
      mockPrisma.account.findFirst.mockResolvedValue(projectedAccount);

      const result = await service.create(
        { email: 'new@x.com', kind: AccountKind.ADMIN, firstName: 'N', lastName: 'U' } as any,
        superActor,
      );

      expect(result.id).toBe('acc1');
      expect(txMock.account.create).toHaveBeenCalled();
      expect(txMock.profile.create).toHaveBeenCalled();
      expect(mockEmail.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'new@x.com', template: 'admin-invite' }),
      );
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('sends the OTP invite email for OTP-only login method', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null);
      txMock.account.create.mockResolvedValue({ id: 'acc1', email: 'otp@x.com' });
      txMock.profile.create.mockResolvedValue({});
      mockEmail.sendOtpAdminInviteEmail.mockResolvedValue({ success: true });
      mockPrisma.account.findFirst.mockResolvedValue(projectedAccount);

      await service.create(
        { email: 'otp@x.com', kind: AccountKind.ADMIN, loginMethod: LoginMethod.OTP } as any,
        superActor,
      );

      expect(mockEmail.sendOtpAdminInviteEmail).toHaveBeenCalledWith(
        'otp@x.com',
        expect.objectContaining({ invitedBy: 'super@x.com' }),
      );
      expect(mockEmail.sendEmail).not.toHaveBeenCalled();
    });

    it('logs an error when invite email fails but does not throw', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null);
      txMock.account.create.mockResolvedValue({ id: 'acc1', email: 'new@x.com' });
      txMock.profile.create.mockResolvedValue({});
      mockEmail.sendEmail.mockResolvedValue({ success: false });
      mockPrisma.account.findFirst.mockResolvedValue(projectedAccount);

      await service.create({ email: 'new@x.com', kind: AccountKind.ADMIN } as any, superActor);

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('does not send any email when creating a plain USER', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null);
      txMock.account.create.mockResolvedValue({ id: 'acc1', email: 'user@x.com' });
      txMock.profile.create.mockResolvedValue({});
      mockPrisma.account.findFirst.mockResolvedValue(projectedAccount);

      await service.create({ email: 'user@x.com', kind: AccountKind.USER } as any, superActor);

      expect(mockEmail.sendEmail).not.toHaveBeenCalled();
      expect(mockEmail.sendOtpAdminInviteEmail).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates profile and account fields', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce({
        id: 'acc1',
        kind: AccountKind.ADMIN,
        profile: {},
      });
      txMock.profile.update.mockResolvedValue({});
      txMock.account.update.mockResolvedValue({});
      mockPrisma.account.findFirst.mockResolvedValueOnce(projectedAccount);

      await service.update('acc1', { firstName: 'New', isActive: false } as any, superActor);

      expect(txMock.profile.update).toHaveBeenCalledWith({
        where: { accountId: 'acc1' },
        data: { firstName: 'New' },
      });
      expect(txMock.account.update).toHaveBeenCalled();
      // disabling revokes refresh tokens
      expect(txMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { accountId: 'acc1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('throws NotFoundException for a missing account', async () => {
      mockPrisma.account.findFirst.mockResolvedValue(null);
      await expect(
        service.update('acc1', { firstName: 'X' } as any, superActor),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('forbids a non-super updating a SUPER_ADMIN', async () => {
      mockPrisma.account.findFirst.mockResolvedValue({
        id: 'acc1',
        kind: AccountKind.SUPER_ADMIN,
        profile: {},
      });
      await expect(
        service.update('acc1', { firstName: 'X' } as any, adminActor),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('disable / enable', () => {
    it('disable delegates to update with isActive=false', async () => {
      const spy = jest.spyOn(service, 'update').mockResolvedValue({ id: 'acc1' } as any);
      await service.disable('acc1', superActor);
      expect(spy).toHaveBeenCalledWith('acc1', { isActive: false }, superActor);
    });

    it('enable delegates to update with isActive=true', async () => {
      const spy = jest.spyOn(service, 'update').mockResolvedValue({ id: 'acc1' } as any);
      await service.enable('acc1', superActor);
      expect(spy).toHaveBeenCalledWith('acc1', { isActive: true }, superActor);
    });
  });

  describe('hardDelete', () => {
    it('deletes an account', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({
        id: 'acc1',
        kind: AccountKind.ADMIN,
      });
      mockPrisma.account.delete.mockResolvedValue({});

      await service.hardDelete('acc1', superActor);

      expect(mockPrisma.account.delete).toHaveBeenCalledWith({ where: { id: 'acc1' } });
    });

    it('throws NotFoundException when the account is missing', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null);
      await expect(service.hardDelete('acc1', superActor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('forbids a non-super deleting a SUPER_ADMIN', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({
        id: 'acc1',
        kind: AccountKind.SUPER_ADMIN,
      });
      await expect(service.hardDelete('acc1', adminActor)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('forbids deleting your own account', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({
        id: 'super1',
        kind: AccountKind.SUPER_ADMIN,
      });
      await expect(service.hardDelete('super1', superActor)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('setRoles', () => {
    it('replaces the account roles', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce({
        id: 'acc1',
        kind: AccountKind.ADMIN,
      });
      mockPrisma.role.findMany.mockResolvedValue([{ id: 'r1', name: 'Editor' }]);
      txMock.accountRole.deleteMany.mockResolvedValue({ count: 0 });
      txMock.accountRole.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.account.findFirst.mockResolvedValueOnce(projectedAccount);

      await service.setRoles('acc1', { roleIds: ['r1'] } as any, superActor);

      expect(txMock.accountRole.deleteMany).toHaveBeenCalledWith({
        where: { accountId: 'acc1' },
      });
      expect(txMock.accountRole.createMany).toHaveBeenCalledWith({
        data: [{ accountId: 'acc1', roleId: 'r1', grantedBy: 'super1' }],
      });
    });

    it('throws NotFoundException for a missing account', async () => {
      mockPrisma.account.findFirst.mockResolvedValue(null);
      await expect(
        service.setRoles('acc1', { roleIds: [] } as any, superActor),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('forbids a non-super granting the SUPER_ADMIN role', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce({
        id: 'acc1',
        kind: AccountKind.ADMIN,
      });
      mockPrisma.role.findMany.mockResolvedValue([{ id: 'r1', name: 'SUPER_ADMIN' }]);
      await expect(
        service.setRoles('acc1', { roleIds: ['r1'] } as any, adminActor),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
