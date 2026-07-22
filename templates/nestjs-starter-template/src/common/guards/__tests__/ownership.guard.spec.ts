import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { OwnershipGuard } from '../ownership.guard';
import { CHECK_OWNERSHIP_KEY } from '../../decorators/check-ownership.decorator';
import { OwnershipResolverRegistry } from '../../authz/ownership.registry';
import {
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '../../exceptions/custom-exceptions';

function buildContext(
  meta: unknown,
  user: { id: string } | undefined,
  params: Record<string, string>,
): { ctx: ExecutionContext; reflector: Reflector } {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(meta as never);
  const ctx = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user, params }) }),
  } as unknown as ExecutionContext;
  return { ctx, reflector };
}

describe('OwnershipGuard', () => {
  it('is a no-op when @CheckOwnership is not declared', async () => {
    const { ctx, reflector } = buildContext(undefined, { id: 'u1' }, {});
    const registry = new OwnershipResolverRegistry();
    expect(await new OwnershipGuard(reflector, registry).canActivate(ctx)).toBe(true);
  });

  it('requires an authenticated user', async () => {
    const { ctx, reflector } = buildContext({ resource: 'file' }, undefined, { id: 'x' });
    const registry = new OwnershipResolverRegistry();
    registry.register('file', async () => ({ ownerAccountId: 'someone' }));
    await expect(new OwnershipGuard(reflector, registry).canActivate(ctx)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('500s when no resolver is registered for the resource', async () => {
    const { ctx, reflector } = buildContext({ resource: 'absent' }, { id: 'u1' }, { id: 'x' });
    const registry = new OwnershipResolverRegistry();
    await expect(new OwnershipGuard(reflector, registry).canActivate(ctx)).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('404s when the resolver returns null', async () => {
    const { ctx, reflector } = buildContext({ resource: 'file' }, { id: 'u1' }, { id: 'x' });
    const registry = new OwnershipResolverRegistry();
    registry.register('file', async () => null);
    await expect(new OwnershipGuard(reflector, registry).canActivate(ctx)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('403s when the targeted resource belongs to someone else', async () => {
    const { ctx, reflector } = buildContext({ resource: 'file' }, { id: 'u1' }, { id: 'x' });
    const registry = new OwnershipResolverRegistry();
    registry.register('file', async () => ({ ownerAccountId: 'u2' }));
    await expect(new OwnershipGuard(reflector, registry).canActivate(ctx)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows when the resource is owned by the caller', async () => {
    const { ctx, reflector } = buildContext({ resource: 'file' }, { id: 'u1' }, { id: 'x' });
    const registry = new OwnershipResolverRegistry();
    registry.register('file', async () => ({ ownerAccountId: 'u1' }));
    expect(await new OwnershipGuard(reflector, registry).canActivate(ctx)).toBe(true);
  });
});
