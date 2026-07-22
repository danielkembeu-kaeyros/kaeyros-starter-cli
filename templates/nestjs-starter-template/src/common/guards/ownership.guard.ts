import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OwnershipResolverRegistry } from '../authz/ownership.registry';
import { CHECK_OWNERSHIP_KEY } from '../decorators/check-ownership.decorator';
import { CheckOwnershipMeta, RequestUser } from '../authz/types';
import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '../exceptions/custom-exceptions';

/**
 * Verifies that the targeted resource is owned by `request.user`.
 *
 * Pairs with @CheckOwnership({ resource, param }). The resolver for
 * `resource` is looked up in OwnershipResolverRegistry; a missing
 * resolver is a configuration bug (500) — never a silent allow.
 */
@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly registry: OwnershipResolverRegistry,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<CheckOwnershipMeta | undefined>(
      CHECK_OWNERSHIP_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!meta) return true;

    const request = context.switchToHttp().getRequest<{
      user?: RequestUser;
      params: Record<string, string>;
    }>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    const paramName = meta.param ?? 'id';
    const id = request.params?.[paramName];
    if (!id) {
      throw new BadRequestException(`Route param "${paramName}" is required for ownership check`);
    }

    const resolver = this.registry.get(meta.resource);
    if (!resolver) {
      throw new InternalServerErrorException(
        `No ownership resolver registered for resource "${meta.resource}"`,
      );
    }

    const owner = await resolver(id);
    if (!owner) {
      throw new NotFoundException('Resource not found');
    }

    if (owner.ownerAccountId !== user.id) {
      throw new ForbiddenException('You do not own this resource');
    }

    return true;
  }
}
