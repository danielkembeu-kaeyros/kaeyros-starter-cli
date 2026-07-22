import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, throwError, lastValueFrom } from 'rxjs';
import { AuditStatus, AuditAction } from '@prisma/client';
import { AuditInterceptor } from '../audit.interceptor';
import { AuditService } from '../audit.service';
import { AuditMeta } from '../decorators/audit.decorator';

describe('AuditInterceptor', () => {
  let module: TestingModule;
  let interceptor: AuditInterceptor;
  let reflector: Reflector;
  let auditService: AuditService;

  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const actor = { id: 'acc-1', email: 'user@test.dev' };

  const buildContext = (request: Record<string, unknown> = {}): ExecutionContext =>
    ({
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => ({
          user: actor,
          params: { id: 'res-42' },
          ...request,
        }),
      }),
      getHandler: jest.fn().mockReturnValue(function handler() {}),
      getClass: jest.fn().mockReturnValue(class Controller {}),
    }) as unknown as ExecutionContext;

  const okHandler = (value: unknown = 'data'): CallHandler => ({
    handle: jest.fn().mockReturnValue(of(value)),
  });

  const errHandler = (err: Error): CallHandler => ({
    handle: jest.fn().mockReturnValue(throwError(() => err)),
  });

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        AuditInterceptor,
        { provide: Reflector, useValue: mockReflector },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    interceptor = module.get<AuditInterceptor>(AuditInterceptor);
    reflector = module.get<Reflector>(Reflector);
    auditService = module.get<AuditService>(AuditService);
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should pass through and NOT log when no @Audit metadata is present', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);

    const result = await lastValueFrom(
      interceptor.intercept(buildContext(), okHandler('response')),
    );

    expect(result).toBe('response');
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('should log SUCCESS with actor + resource when handler succeeds', async () => {
    const meta: AuditMeta = {
      action: AuditAction.ACCOUNT_CREATED,
      resource: 'account',
    };
    mockReflector.getAllAndOverride.mockReturnValue(meta);

    const result = await lastValueFrom(interceptor.intercept(buildContext(), okHandler('created')));

    expect(result).toBe('created');
    expect(auditService.log).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith(
      {
        action: AuditAction.ACCOUNT_CREATED,
        actorAccountId: actor.id,
        actorEmail: actor.email,
        resource: 'account',
        resourceId: 'res-42',
        status: AuditStatus.SUCCESS,
      },
      expect.objectContaining({ user: actor }),
    );
  });

  it('should use a custom resourceIdParam when configured', async () => {
    const meta: AuditMeta = {
      action: AuditAction.ROLE_UPDATED,
      resource: 'role',
      resourceIdParam: 'roleId',
    };
    mockReflector.getAllAndOverride.mockReturnValue(meta);

    await lastValueFrom(
      interceptor.intercept(buildContext({ params: { roleId: 'role-7' } }), okHandler()),
    );

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: 'role-7' }),
      expect.anything(),
    );
  });

  it('should log FAILURE and rethrow when the handler errors', async () => {
    const meta: AuditMeta = {
      action: AuditAction.ACCOUNT_DELETED,
      resource: 'account',
    };
    mockReflector.getAllAndOverride.mockReturnValue(meta);

    await expect(
      lastValueFrom(interceptor.intercept(buildContext(), errHandler(new Error('denied')))),
    ).rejects.toThrow('denied');

    expect(auditService.log).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.ACCOUNT_DELETED,
        actorAccountId: actor.id,
        actorEmail: actor.email,
        resource: 'account',
        status: AuditStatus.FAILURE,
        metadata: { error: 'denied' },
      }),
      expect.anything(),
    );
  });

  it('should tolerate a missing actor (undefined actor fields)', async () => {
    const meta: AuditMeta = { action: AuditAction.RESOURCE_ACCESSED, resource: 'account' };
    mockReflector.getAllAndOverride.mockReturnValue(meta);

    await lastValueFrom(interceptor.intercept(buildContext({ user: undefined }), okHandler()));

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorAccountId: undefined,
        actorEmail: undefined,
        status: AuditStatus.SUCCESS,
      }),
      expect.anything(),
    );
  });
});
