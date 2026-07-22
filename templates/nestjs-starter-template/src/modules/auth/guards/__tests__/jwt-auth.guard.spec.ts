import 'reflect-metadata';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../../../../common/decorators/public.decorator';

describe('JwtAuthGuard', () => {
  const handler = () => undefined;
  class TestController {}

  const buildContext = (): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => TestController,
      switchToHttp: () => ({
        getRequest: () => ({}),
      }),
    }) as unknown as ExecutionContext;

  it('returns true (short-circuits passport) for @Public() routes', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);

    expect(guard.canActivate(buildContext())).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      handler,
      TestController,
    ]);
  });

  it('defers to the passport AuthGuard for non-public routes', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);

    // super.canActivate is the real passport implementation; stub it so the
    // test exercises only the delegation decision, not passport internals.
    const superSpy = jest
      .spyOn(
        Object.getPrototypeOf(JwtAuthGuard.prototype) as {
          canActivate: ExecutionContext['getHandler'];
        },
        'canActivate',
      )
      .mockReturnValue('delegated' as never);

    const result = guard.canActivate(buildContext());

    expect(superSpy).toHaveBeenCalled();
    expect(result).toBe('delegated');

    superSpy.mockRestore();
  });
});
