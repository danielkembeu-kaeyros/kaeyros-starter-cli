import { AccountKind } from '@prisma/client';

/**
 * JWT access-token payload.
 * The token carries enough to identify the actor; roles/permissions are
 * re-resolved on every request from the DB so a revoked grant takes effect
 * immediately.
 */
export interface JwtPayload {
  sub: string; // account id
  kind: AccountKind;
  iat?: number;
  exp?: number;
}

/**
 * Shape attached to `request.user` by JwtStrategy.validate (phase 4).
 * The flat `roles` and `permissions` string arrays are the contract that
 * PermissionsGuard reads — never change the shape without updating both.
 */
export interface RequestUser {
  id: string;
  email: string;
  kind: AccountKind;
  isActive: boolean;
  isEmailVerified: boolean;
  mustChangePassword: boolean;
  roles: string[];
  permissions: string[];
}

/**
 * Resolves the owner of a resource by id.
 * Returns null when the resource does not exist (the guard turns that into 404).
 */
export type OwnershipResolver = (id: string) => Promise<{ ownerAccountId: string } | null>;

/**
 * Metadata attached to a route by `@CheckOwnership`.
 */
export interface CheckOwnershipMeta {
  /** Name of the route param holding the resource id. Defaults to "id". */
  param?: string;
  /** Registered resource name; must match a registry entry. */
  resource: string;
}
