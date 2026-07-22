import { AccountKind, LoginMethod, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';

/** A password that satisfies the IsStrongPassword policy (>=10, upper/lower/digit/symbol). */
export const STRONG_PASSWORD = 'CorrectHorse9!';

export interface SeededAccount {
  id: string;
  email: string;
  password: string;
}

interface CreateAccountOpts {
  email: string;
  password?: string;
  kind?: AccountKind;
  roleName?: 'SUPER_ADMIN' | 'ADMIN' | 'USER';
  isEmailVerified?: boolean;
  mustChangePassword?: boolean;
  loginMethod?: LoginMethod;
  firstName?: string;
  lastName?: string;
}

/**
 * Create a ready-to-login account directly via Prisma (bypassing the invite
 * flow), optionally attaching one seeded role. Returns the plaintext password
 * so the caller can log in.
 */
export async function createAccount(
  prisma: PrismaClient,
  opts: CreateAccountOpts,
): Promise<SeededAccount> {
  const password = opts.password ?? STRONG_PASSWORD;
  const passwordHash = await bcrypt.hash(password, 10);

  const account = await prisma.account.create({
    data: {
      email: opts.email,
      password: passwordHash,
      kind: opts.kind ?? AccountKind.USER,
      isEmailVerified: opts.isEmailVerified ?? true,
      emailVerifiedAt: opts.isEmailVerified === false ? null : new Date(),
      mustChangePassword: opts.mustChangePassword ?? false,
      loginMethod: opts.loginMethod ?? LoginMethod.PASSWORD,
      profile: { create: { firstName: opts.firstName, lastName: opts.lastName } },
    },
  });

  if (opts.roleName) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: opts.roleName } });
    await prisma.accountRole.create({ data: { accountId: account.id, roleId: role.id } });
  }

  return { id: account.id, email: account.email, password };
}

/** Convenience: a verified end-user with the USER role. */
export function createUser(prisma: PrismaClient, email: string): Promise<SeededAccount> {
  return createAccount(prisma, { email, kind: AccountKind.USER, roleName: 'USER' });
}

/** Convenience: a SUPER_ADMIN with every permission (mustChangePassword=false). */
export function createSuperAdmin(prisma: PrismaClient, email: string): Promise<SeededAccount> {
  return createAccount(prisma, {
    email,
    kind: AccountKind.SUPER_ADMIN,
    roleName: 'SUPER_ADMIN',
  });
}

export interface LoginResult {
  accessToken: string;
  refreshCookie: string | undefined;
  body: Record<string, unknown>;
}

/** Log in via the HTTP API and return the access token + refresh cookie. */
export async function loginAs(
  app: INestApplication,
  email: string,
  password = STRONG_PASSWORD,
): Promise<LoginResult> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);

  const setCookie = res.headers['set-cookie'] as unknown as string[] | undefined;
  const refreshCookie = setCookie?.find((c) => c.startsWith('refreshToken='));

  return { accessToken: res.body.accessToken, refreshCookie, body: res.body };
}

/** Authorization header tuple for supertest `.set(...)`. */
export function bearer(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}
