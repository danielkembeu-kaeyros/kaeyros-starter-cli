import 'reflect-metadata';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MustChangePasswordGuard } from '../must-change-password.guard';
import { ForbiddenException } from '../../../../common/exceptions/custom-exceptions';
import { IS_PUBLIC_KEY } from '../../../../common/decorators/public.decorator';
import { ALLOWED_WHILE_PASSWORD_CHANGE_KEY } from '../../decorators/allowed-while-password-change.decorator';
import { RequestUser } from '../../../../common/authz/types';

describe('MustChangePasswordGuard', () => {
  const handler = () => undefined;
  class TestController {}

  const buildContext = (user?: Partial<RequestUser>): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => handler,
      getClass: () => TestController,
    }) as unknown as ExecutionContext;

  // Reflector whose getAllAndOverride answers per-metadata-key.
  const reflectorFor = (flags: { isPublic?: boolean; allowed?: boolean }): Reflector =>
    ({
      getAllAndOverride: jest.fn((key: string) => {
        if (key === IS_PUBLIC_KEY) return flags.isPublic ?? false;
        if (key === ALLOWED_WHILE_PASSWORD_CHANGE_KEY) return flags.allowed ?? false;
        return undefined;
      }),
    }) as unknown as Reflector;

  it('allows when the route is @Public()', () => {
    const guard = new MustChangePasswordGuard(reflectorFor({ isPublic: true }));
    expect(guard.canActivate(buildContext())).toBe(true);
  });

  it('allows when there is no authenticated user', () => {
    const guard = new MustChangePasswordGuard(reflectorFor({}));
    expect(guard.canActivate(buildContext(undefined))).toBe(true);
  });

  it('allows when mustChangePassword is false', () => {
    const guard = new MustChangePasswordGuard(reflectorFor({}));
    expect(guard.canActivate(buildContext({ mustChangePassword: false }))).toBe(true);
  });

  it('allows when route is @AllowedWhilePasswordChange() even if flag is true', () => {
    const guard = new MustChangePasswordGuard(reflectorFor({ allowed: true }));
    expect(guard.canActivate(buildContext({ mustChangePassword: true }))).toBe(true);
  });

  it('throws ForbiddenException when flag is true and route is not allowed', () => {
    const guard = new MustChangePasswordGuard(reflectorFor({}));
    expect(() => guard.canActivate(buildContext({ mustChangePassword: true }))).toThrow(
      ForbiddenException,
    );
  });
});
