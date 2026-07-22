import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { PermissionsGuard } from '../permissions.guard';
import { IS_PUBLIC_KEY } from '../../decorators/public.decorator';
import { AUTHENTICATED_KEY } from '../../decorators/authenticated.decorator';
import {
  PERMISSIONS_ALL_KEY,
  PERMISSIONS_ANY_KEY,
} from '../../decorators/require-permissions.decorator';
import { AccountKind } from '@prisma/client';
import { ForbiddenException, UnauthorizedException } from '../../exceptions/custom-exceptions';

function buildContext(
  meta: Record<string, unknown>,
  user?: Partial<{ id: string; permissions: string[] }>,
): { ctx: ExecutionContext; reflector: Reflector } {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) => {
    return (meta as Record<string, unknown>)[key as string] as never;
  });
  const ctx = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
  return { ctx, reflector };
}

describe('PermissionsGuard (zero-trust)', () => {
  it('allows public routes regardless of user state', () => {
    const { ctx, reflector } = buildContext({ [IS_PUBLIC_KEY]: true });
    expect(new PermissionsGuard(reflector).canActivate(ctx)).toBe(true);
  });

  it('throws Unauthorized when no user is attached and the route is not public', () => {
    const { ctx, reflector } = buildContext({});
    expect(() => new PermissionsGuard(reflector).canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('denies by default when an authenticated route declares no metadata', () => {
    const { ctx, reflector } = buildContext({}, {
      id: 'a1',
      permissions: [],
      kind: AccountKind.USER,
    } as never);
    expect(() => new PermissionsGuard(reflector).canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows @Authenticated routes for any signed-in user', () => {
    const { ctx, reflector } = buildContext({ [AUTHENTICATED_KEY]: true }, {
      id: 'a1',
      permissions: [],
      kind: AccountKind.USER,
    } as never);
    expect(new PermissionsGuard(reflector).canActivate(ctx)).toBe(true);
  });

  it('requires ALL permissions for @RequirePermissions', () => {
    const { ctx, reflector } = buildContext(
      { [PERMISSIONS_ALL_KEY]: ['accounts:read', 'accounts:update'] },
      { id: 'a1', permissions: ['accounts:read'], kind: AccountKind.USER } as never,
    );
    expect(() => new PermissionsGuard(reflector).canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('passes when all required permissions are held', () => {
    const { ctx, reflector } = buildContext({ [PERMISSIONS_ALL_KEY]: ['accounts:read'] }, {
      id: 'a1',
      permissions: ['accounts:read', 'accounts:update'],
      kind: AccountKind.USER,
    } as never);
    expect(new PermissionsGuard(reflector).canActivate(ctx)).toBe(true);
  });

  it('requires ONE permission for @RequireAnyPermission', () => {
    const { ctx, reflector } = buildContext(
      { [PERMISSIONS_ANY_KEY]: ['accounts:read', 'accounts:create'] },
      { id: 'a1', permissions: ['accounts:create'], kind: AccountKind.USER } as never,
    );
    expect(new PermissionsGuard(reflector).canActivate(ctx)).toBe(true);
  });
});
