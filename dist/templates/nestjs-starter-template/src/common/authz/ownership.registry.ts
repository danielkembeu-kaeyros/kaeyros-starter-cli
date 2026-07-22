import { Injectable } from '@nestjs/common';
import { OwnershipResolver } from './types';

/**
 * Central registry mapping a resource name to its owner-resolver.
 *
 * Feature modules register their resources at construction time, e.g.:
 *
 *     constructor(registry: OwnershipResolverRegistry, prisma: PrismaService) {
 *       registry.register('profile', async (id) => {
 *         const row = await prisma.profile.findUnique({
 *           where: { id },
 *           select: { accountId: true },
 *         });
 *         return row ? { ownerAccountId: row.accountId } : null;
 *       });
 *     }
 *
 * `OwnershipGuard` looks resolvers up here when a route is annotated with
 * `@CheckOwnership({ resource: 'profile', param: 'id' })`.
 */
@Injectable()
export class OwnershipResolverRegistry {
  private readonly resolvers = new Map<string, OwnershipResolver>();

  register(resource: string, resolver: OwnershipResolver): void {
    if (this.resolvers.has(resource)) {
      throw new Error(
        `Ownership resolver already registered for resource "${resource}". ` +
          `Each resource may only have one resolver.`,
      );
    }
    this.resolvers.set(resource, resolver);
  }

  get(resource: string): OwnershipResolver | undefined {
    return this.resolvers.get(resource);
  }

  has(resource: string): boolean {
    return this.resolvers.has(resource);
  }
}
