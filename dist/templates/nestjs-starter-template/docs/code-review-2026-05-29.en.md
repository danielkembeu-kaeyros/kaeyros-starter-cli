# NestJS Backend Review — `nestjs-starter`

**Date:** 2026-05-29
**Reviewer:** Claude (nestjs-backend-review skill)
**Scope:** full repository on branch `develop`
**Method:** map the codebase, run categorized searches, read hot files, trace end-to-end flows for auth and money/data-integrity, then rate findings.

## Overview

Reviewed an enterprise NestJS starter (NestJS 10, Prisma 7, Passport JWT, Winston, Helmet, Throttler, AWS S3, nodemailer). The bootstrap, exception filter, validation pipe and Prisma layer are in good shape, and security basics (helmet, bcrypt, CORS allowlist, HMAC-signed JWT, sanitised log bodies, `synchronize`-free Prisma) are present.

The single biggest issue is that **the RBAC layer is wired incorrectly end-to-end**: the JWT strategy returns a user shape that doesn't carry the flat `roles`/`permissions` arrays the global `RolesGuard` and `PermissionsGuard` look for, and an entire alternate `@Authorize` / `@AdminOnly` / `Can*Users` decorator family exists with **no guard reading its metadata**. The combination is dangerous because, depending on which decorator a developer reaches for, the same endpoint can either lock out everybody (`@Roles('ADMIN')` → always denied) or silently let anyone in (`@AdminOnly()` → no-op). A few other items round it out: `getPresignedUrl` issues PUT URLs instead of GET, the S3 controller has no per-user/role scoping, the throttler module is configured but never registered as a guard, a hardcoded admin password is auto-seeded in dev/staging, and the email verification code uses `Math.random`.

## Summary table

| #   | Finding                                                                                                                                                                                                                    | Severity |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | RBAC silently broken: `request.user` shape doesn't match what `RolesGuard`/`PermissionsGuard` read                                                                                                                         | 🔴 S1    |
| 2   | `@Authorize`/`@AdminOnly`/`Can*Users` decorators have no enforcing guard (silent allow)                                                                                                                                    | 🔴 S1    |
| 3   | `AwsController` endpoints (upload/delete/presign) have no ownership or role check — any logged-in user can read/write/delete any S3 key                                                                                    | 🔴 S1    |
| 4   | `getPresignedUrl` issues a **PUT** presigned URL instead of GET — both a functional bug and a write-grant exposure                                                                                                         | 🔴 S1    |
| 5   | Hardcoded admin password `passwordAdmin` auto-seeded in development _and_ staging                                                                                                                                          | 🔴 S1    |
| 6   | `ThrottlerModule` configured but `ThrottlerGuard` not registered — no rate limiting on login/register/reset                                                                                                                | 🟠 S2    |
| 7   | Email verification code uses `Math.random()` (5 digits, ~17 bits of entropy)                                                                                                                                               | 🟠 S2    |
| 8   | Account-disabled error in `validateUser` enables user enumeration on `/auth/login`                                                                                                                                         | 🟠 S2    |
| 9   | `PermissionsGuard` / `RolesGuard` fail open when no metadata is set (no deny-by-default)                                                                                                                                   | 🟠 S2    |
| 10  | `register` weakens password policy vs. `resetPassword` (6 chars, no complexity)                                                                                                                                            | 🟠 S2    |
| 11  | `RegisterDto` lets caller pass arbitrary `firstName`/`lastName`; `register()` spreads via positional args (low blast radius today, but the `update` shape will be a problem the moment a profile-update endpoint is added) | 🟡 S3    |
| 12  | `refreshTokens` flow is non-atomic across `update`/`create` — partial failure can revoke without issuing                                                                                                                   | 🟡 S3    |
| 13  | RefreshToken DB `token` column (hex) is never compared on refresh — dead field / misleading model                                                                                                                          | 🟡 S3    |
| 14  | `console.*` used in `sentry.config.ts`, `db-transport.ts`, `winston.config.ts` instead of the framework logger                                                                                                             | 🟡 S3    |
| 15  | `throw new Error(...)` in controllers/services → returns HTTP 500 instead of 4xx                                                                                                                                           | 🟡 S3    |
| 16  | `ValidationPipe` has `forbidNonWhitelisted: false` — unknown body fields silently dropped instead of rejected                                                                                                              | 🟡 S3    |
| 17  | `S3Client` instantiated even when credentials are absent (only a warn) — silent runtime failures downstream                                                                                                                | 🟢 S4    |
| 18  | `UsersModule` is an empty placeholder still wired into the root module                                                                                                                                                     | 🟢 S4    |
| 19  | `LogsModule` import commented out in `app.module.ts` — orphaned feature                                                                                                                                                    | 🟢 S4    |
| 20  | `JwtPayload.email` / `roles` are optional in the type, but `login()` always sets them — type drift                                                                                                                         | 🟢 S4    |

---

## 🔴 S1 — Critical

### 1. RBAC broken: `RolesGuard`/`PermissionsGuard` look for fields that don't exist on `request.user`

**Location:** `src/modules/auth/strategies/jwt.strategy.ts:21-23`, `src/modules/auth/auth.service.ts:314-341`, `src/common/guards/roles.guard.ts:27`, `src/common/guards/permissions.guard.ts:27`

```ts
// jwt.strategy.ts
async validate(payload: JwtPayload): Promise<UserWithRoles> {
  return this.authService.validateJwtPayload(payload);   // returns UserWithRoles (no flat .roles / .permissions)
}

// auth.service.ts (validateJwtPayload)
const { password: _, ...result } = user;
return result as UserWithRoles;                          // includes user.userRoles[].role.permissions[] – nested, not flat

// roles.guard.ts
const userRoles = user.roles || [];                      // <- user.roles is undefined → []
const hasRole = requiredRoles.some(role => userRoles.includes(role));   // always false → ForbiddenException

// permissions.guard.ts
const userPermissions = user.permissions || [];          // <- same: always []
```

**Why it's a problem:** the global guards rely on a flattened shape (`user.roles: string[]`, `user.permissions: string[]`) that only exists in the JWT payload and in `UserResponse`. The `JwtStrategy.validate()` return becomes `request.user` and is the nested Prisma shape (`userRoles[].role…`). Any route protected with `@Roles('ADMIN')` or `@RequirePermissions('users:read')` will deny **every** caller, including the seeded admin. Today this only bites `LogsController` (which is itself commented out — see #19), so the bug is latent — but it will silently break the first real RBAC endpoint added.

**Recommendation:** in `validateJwtPayload`, flatten before returning, and tighten the type so the guards' contract is enforced:

```ts
const roles = user.userRoles?.map((ur) => ur.role.name) ?? [];
const permissions =
  user.userRoles?.flatMap((ur) => ur.role.permissions?.map((rp) => rp.permission.name) ?? []) ?? [];
return { ...result, roles, permissions } as UserWithRoles & {
  roles: string[];
  permissions: string[];
};
```

Make `roles`/`permissions` required on the type the guards consume so the compiler catches future regressions.

---

### 2. `@Authorize` / `@AdminOnly` / `Can*Users` decorators exist with no guard reading them — silent allow

**Location:** `src/common/decorators/authorize.decorator.ts:1-68`, `src/app.module.ts:78-89` (guard providers)

```ts
// authorize.decorator.ts
export const AUTHORIZATION_KEY = 'authorization';
export const Authorize = (rules: AuthorizationRule): MethodDecorator =>
  SetMetadata(AUTHORIZATION_KEY, rules);
export const AdminOnly = (): MethodDecorator => Authorize({ roles: ['ADMIN'] });
export const CanCreateUsers = (): MethodDecorator => Authorize({ permissions: ['users:create'] });
```

`grep -r AUTHORIZATION_KEY src` shows the key is referenced only in the decorator file itself — no `AuthorizeGuard` consumes it. Global guards in `app.module.ts:78-89` are `JwtAuthGuard`, `RolesGuard` (`ROLES_KEY`) and `PermissionsGuard` (`PERMISSIONS_KEY`); none read `AUTHORIZATION_KEY`.

**Why it's a problem:** the Swagger-style documentation in this decorator file invites a future developer to write `@AdminOnly()` on a route that performs a privileged action. The route will pass the `JwtAuthGuard` (any logged-in user), see no `ROLES_KEY`/`PERMISSIONS_KEY` metadata, and be **silently allowed**. This is the classic "looks like security, is actually decoration" footgun.

**Recommendation:** either implement an `AuthorizeGuard` that reads `AUTHORIZATION_KEY` (delegating to roles/permissions checks, supporting `requireAll`), or delete `authorize.decorator.ts` entirely and standardize on `@Roles` / `@RequirePermissions`. If you keep the file, add a unit test that fails when `AUTHORIZATION_KEY` metadata is set on a route with no enforcing guard.

---

### 3. `AwsController` endpoints lack ownership and role scoping — any authenticated user can read/write/delete any S3 key

**Location:** `src/modules/aws/aws.controller.ts:33-188`

```ts
@Controller('aws')
@UseGuards(JwtAuthGuard)              // <- only "is logged in" check
export class AwsController {
  @Post('upload') ...
  @Delete(':key')   async deleteFile(@Param('key') key: string) { ... }
  @Get('presigned-url/:key') async getPresignedUrl(@Param('key') key: string, ...) { ... }
}
```

There is no `@Roles`, no `@RequirePermissions`, no per-user prefix/ownership check. The Prisma schema has nothing tying S3 keys to a user. Combined with `body-parser.json({ limit: '5mb' })` and `FilesInterceptor('files', 10)` (10× ≈ 50 MB per request, no MIME/size restriction), any verified or unverified user (`isEmailVerified` is not enforced anywhere) can:

- Upload arbitrary content (including executable types) to the configured bucket — at attacker-controlled keys via `customKey` if exposed, or with predictable `${Date.now()}-${file.originalname}` keys.
- Delete any object in the bucket by guessing/knowing keys (e.g. `logs/error-2026-05-29.log.gz` — exactly the key pattern `winston.config.ts:74` writes).
- Generate a presigned URL for any key (and because of #4, that URL also grants **write** access).

**Why it's a problem:** all three combine into a tenant-wide S3 read/write/delete primitive scoped only to "has an account." For a starter template intended to be cloned, this should not ship.

**Recommendation:**

- Gate the controller with `@Roles('ADMIN')` (or a dedicated `files:*` permission set) until per-user file ownership is modeled.
- Add a `Files` Prisma table (`id, userId, s3Key, mime, size, …`) and resolve operations through the DB so callers can only act on their own rows.
- In the meantime, enforce a key prefix derived from `request.user.id` server-side, validate MIME types and size, and reject `..`/leading-`/` in `:key`.

---

### 4. `getPresignedUrl` issues a PUT URL instead of GET

**Location:** `src/modules/aws/aws.service.ts:142-150` (and `src/modules/aws/aws.controller.ts:159-188`)

```ts
async getPresignedUrl(key: string, bucketName?: string, expiresIn = 3600) {
  ...
  const command = new PutObjectCommand({                 // <- should be GetObjectCommand
    Bucket: bucket,
    Key: key,
  });
  const url = await getSignedUrl(this.s3Client, command, { expiresIn });
  ...
}
```

**Why it's a problem:** two failure modes at once. (a) The endpoint is documented and named as "Get a presigned URL for a file" — what it actually returns is a temporary **upload** URL. Anyone who fetches `/aws/presigned-url/some-key` can then `PUT` arbitrary bytes at `some-key` for one hour. (b) The `LogsService.generatePresignedUrls` (`src/modules/logs/logs.service.ts:78-101`) hands these URLs to admins so they can download rotated log files — those downloads will never work because the URL is signed for `PUT`. The compound effect: the logs viewer is broken, and the AWS controller is a write-anywhere primitive.

**Recommendation:** import and use `GetObjectCommand` in `getPresignedUrl`. Keep `PutObjectCommand` only for a separate, explicitly named `getPresignedUploadUrl` method, gated by the same authz changes from #3.

---

### 5. Hardcoded admin password auto-seeded in development _and_ staging

**Location:** `src/modules/database/seed.service.ts:55-65`, `:254-275`; plus the leaked default credentials in `src/main.ts:96-101`

```ts
// seed.service.ts
async onModuleInit() {
  const nodeEnv = this.configService.get<string>('app.nodeEnv');
  if (nodeEnv === 'production') return this.log('Skipping auto-seed in production');
  await this.seed();                                     // <- runs in development AND staging
}
private async seedAdminUser(adminRole: Role) {
  const hashedPassword = await bcrypt.hash('passwordAdmin', bcryptRounds);
  const adminUser = await this.prisma.user.create({
    data: { email: 'kaeyros.admin@yopmail.com', password: hashedPassword, ... },
  });
}

// main.ts (also published in Swagger description)
//  **Email:** kaeyros.admin@yopmail.com
//  **Password:** passwordAdmin
```

**Why it's a problem:** the guard is on `nodeEnv === 'production'`, but `nodeEnv` is `NODE_ENV` (Node convention) while the rest of the codebase keys environments off `APP_ENV` (see `configuration.ts:159-162`). A staging deploy that follows the convention `APP_ENV=staging`, `NODE_ENV=production` ends up not seeding (good for staging-prod) — but a deploy that sets `APP_ENV=staging`, `NODE_ENV=development` (e.g. for verbose logging) gets an admin account with publicly documented credentials. Worse, the credentials are reproduced verbatim in the Swagger description string, which `main.ts:49` serves whenever `swagger.enabled` is true — default-on in non-prod.

**Recommendation:**

- Key the seed gate off `app.appEnv` and limit auto-seed to `development` only.
- Don't seed a usable password; instead, on first boot, generate a random password, write it to stdout once, and force a reset on first login (or require an env var like `INITIAL_ADMIN_PASSWORD` and refuse to start without it).
- Remove the credentials block from the Swagger description in `main.ts:96-101`, or render it only when `appEnv === 'development'`.

---

## 🟠 S2 — High

### 6. `ThrottlerGuard` not registered — login/register/password-reset are unthrottled

**Location:** `src/app.module.ts:53-62, 70-100`

```ts
ThrottlerModule.forRootAsync({ ... }),    // <- module imported and configured
// providers: APP_GUARD entries are JwtAuthGuard, RolesGuard, PermissionsGuard — no ThrottlerGuard
```

**Why it's a problem:** the README/Swagger advertise "100 req/60s per IP," but only the _module_ is wired. Without a `{ provide: APP_GUARD, useClass: ThrottlerGuard }` (or `@UseGuards(ThrottlerGuard)` per controller), no requests are throttled. `/auth/login`, `/auth/register`, `/auth/request-password-reset` are all `@Public()` and accept unlimited traffic — enumeration, credential stuffing, and reset spam.

**Recommendation:** add `{ provide: APP_GUARD, useClass: ThrottlerGuard }` to `AppModule.providers`. Apply a stricter `@Throttle` to auth/reset routes (e.g. 5 req/min/IP).

---

### 7. Email verification code uses `Math.random()`

**Location:** `src/modules/auth/auth.service.ts:566-568`

```ts
private generateVerificationCode(): string {
  return Math.floor(10000 + Math.random() * 90000).toString();
}
```

**Why it's a problem:** the code is the only thing standing between an authenticated user and `isEmailVerified: true`. 90 000 possible values is brute-forceable in seconds without rate limiting (see #6) — and even with the throttler, `Math.random` is not a CSPRNG. Codes are also valid for 24 h.

**Recommendation:** use `crypto.randomInt(10000, 100000)`, shorten TTL (e.g. 15 min), cap attempts per code, and consider 6-digit codes.

---

### 8. Account-status check before password check enables user enumeration

**Location:** `src/modules/auth/auth.service.ts:55-66`

```ts
if (!user) return null;
if (!user.isActive || user.deletedAt) {
  throw new UnauthorizedException('Account is disabled'); // <- different error for disabled vs unknown
}
const isPasswordValid = await bcrypt.compare(password, user.password);
if (!isPasswordValid) return null; // <- LocalStrategy turns this into "Invalid credentials"
```

**Why it's a problem:** the response distinguishes "email exists but disabled" from "email unknown" from "wrong password." An attacker can enumerate registered emails by probing the response. The password-reset endpoint already takes the right approach (`auth.service.ts:410-418`); login should match.

**Recommendation:** always run `bcrypt.compare` (even against a dummy hash if no user) and return the same generic `Invalid credentials` for all failure modes. Log the disabled-account case server-side.

---

### 9. `PermissionsGuard` / `RolesGuard` fail open when no metadata is present

**Location:** `src/common/guards/permissions.guard.ts:10-18`, `src/common/guards/roles.guard.ts:10-18`

```ts
const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [...]);
if (!requiredPermissions) return true;   // <- allow if no metadata
```

**Why it's a problem:** combined with `JwtAuthGuard` running first, the effective policy is "any authenticated user can hit any endpoint that doesn't carry explicit `@RequirePermissions`." It's the opposite of deny-by-default. A developer who forgets to annotate a new controller method ships an open endpoint. This pattern caused #3 (the AWS controller has neither role nor permission metadata and is therefore wide-open to all authenticated users).

**Recommendation:** make the guard deny by default — if no `PERMISSIONS_KEY` (and no role metadata, and not `@Public()`), throw `ForbiddenException`. Pair with an explicit `@Authenticated()`/`@AnyUser()` decorator for the rare "only logged-in" case so intent is visible at every route.

---

### 10. `register` permits weaker passwords than `reset-password`

**Location:** `src/modules/auth/dto/auth.dto.ts:21-23` vs. `src/modules/auth/dto/reset-password.dto.ts:18-25`

```ts
// register
@MinLength(6)
password: string;

// reset
@MinLength(8)
@Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, ...)
newPassword: string;
```

**Why it's a problem:** a user can register with `aaaaaa`, then never reset, and the system can't even tell. The complexity rule on reset implies a policy; it should apply at the entry point too.

**Recommendation:** centralize the rule (custom `IsStrongPassword` validator, or a shared base DTO) and apply it to both. Run the validator in `auth.service.register` too as defense in depth.

---

## 🟡 S3 — Medium

### 11. `RegisterDto` allows attacker-supplied `firstName`/`lastName`; mass-assignment risk is contained today but not by design

**Location:** `src/modules/auth/auth.service.ts:148-171`, `src/modules/auth/dto/auth.dto.ts:25-33`

`register()` writes only explicit fields, so today this is fine. But the precedent set by `RegisterDto` (open `@IsOptional()` strings, no length cap) and the lack of a project-wide rule against `...dto`/`...body` will bite the moment a profile-update endpoint is added. Cap lengths (`@MaxLength`), strip whitespace, and consider sanitizing.

### 12. `refreshTokens` is not atomic

**Location:** `src/modules/auth/auth.service.ts:251-300`

The flow: verify JWT → load record → check user → `prisma.refreshToken.update({ isRevoked: true })` (line 287) → sign new access token → `generateRefreshToken` (which itself revokes-then-creates inside its own `updateMany`+`create`). None of this is wrapped in `$transaction`. A failure between revoking the old token and creating the new one leaves the user without any valid refresh token. Wrap the whole rotation in `prisma.$transaction(async tx => { ... })` and thread `tx` into `generateRefreshToken`.

### 13. RefreshToken `token` (hex) column is never compared

**Location:** `src/modules/auth/auth.service.ts:201-230` (`generateRefreshToken`) vs. `:256-261` (lookup by `payload.tokenId` only)

```ts
const tokenValue = crypto.randomBytes(64).toString('hex');
...
await this.prisma.refreshToken.create({ data: { token: tokenValue, userId, expiresAt } });

// later, in refreshTokens()
const tokenRecord = await this.prisma.refreshToken.findUnique({ where: { id: payload.tokenId } });
```

The hex value is written, indexed, marked `@unique` — and never read. It does no work because the JWT signature already authenticates the request. Either compare the JWT-embedded hex to the DB column (so token theft requires both the JWT and the DB row to match) or drop the column.

### 14. `console.*` calls in production code paths

**Location:** `src/config/sentry.config.ts:11,16,22,26,51,76`, `src/common/logging/db-transport.ts:51`, `src/common/logging/winston.config.ts:66`, `src/main.ts:176`

`Sentry.init` and the rotate-to-S3 callback both bypass the configured logger, so these messages don't appear in the file/DB transports and aren't structured. Inject `LoggerService` (already global) or use Nest's `Logger`. The bootstrap fallback in `main.ts:176` is fine — at that point the logger may not be available — keep that one.

### 15. `throw new Error(...)` in services/controllers → HTTP 500

**Location:** `src/modules/aws/aws.controller.ts:77, 130`; `src/modules/aws/aws.service.ts:57, 106, 139, 169, 174`; `src/modules/email/email.service.ts:91, 207`

```ts
if (!file) throw new Error('No file provided'); // becomes 500, leaks "No file provided" as InternalServerError
```

These are client-input or configuration errors. Use `BadRequestException` for the controller cases (or rely on `ParseFilePipe`/`@UploadedFile()` validators), and a typed `InternalServerErrorException` only when the misconfiguration is truly server-side.

### 16. `ValidationPipe` accepts unknown fields silently

**Location:** `src/common/pipes/validation.pipe.ts:22-23`

```ts
whitelist: true,
forbidNonWhitelisted: false,    // <- unknown fields silently dropped
```

A client posting `{ email, password, isAdmin: true }` gets a 201 with `isAdmin` quietly stripped. Better to reject loudly so frontends catch typos and would-be mass-assignment attempts: set `forbidNonWhitelisted: true`. Also consider `transform: true` — without it `@Type()` decorators on query DTOs (e.g. `pagination.dto.ts`) only work because `plainToInstance` is being called manually here, but a future `useGlobalPipes(new NestValidationPipe())` swap would break silently.

---

## 🟢 S4 — Low

### 17. `AwsService` constructs the S3 client even without credentials

`src/modules/aws/aws.service.ts:25-35` warns then proceeds with `accessKeyId: ''`. Any later upload fails with a confusing AWS error. Throw `InternalServerErrorException('AWS not configured')` lazily on first use, or refuse to register the provider when in production without creds.

### 18. `UsersModule` is an empty placeholder

`src/modules/users/users.module.ts:1-11` and the comment-in import in `src/app.module.ts:13,66`. Either implement or delete to avoid `nest g` collisions and module-graph noise.

### 19. `LogsModule` import is commented out

`src/app.module.ts:15,68`. The whole logs feature (controller, service, tests) ships in the binary but is never registered. Either re-enable (and fix #4 first) or delete the dead module.

### 20. `JwtPayload.email` / `roles` are optional but always present in writes

`src/types/auth.types.ts:3-9` — fields are `?`, but `auth.service.ts:89-93` always sets them. Tighten the type to remove the `?`, so consumers don't write defensive `payload.roles ?? []` checks.

---

## Recommended remediation order

1. **Fix the RBAC pipeline** before anything else (#1 + #2 + #9). Until `request.user` carries flat `roles`/`permissions` _and_ a guard reads `AUTHORIZATION_KEY` _and_ the default is deny, every other authz decision in this codebase is undefined behavior.
2. **Lock down the AWS controller** (#3 + #4). Swap `PutObjectCommand` → `GetObjectCommand`, gate every endpoint, and add a per-user file model — these are publicly reachable bucket primitives today.
3. **Remove the hardcoded admin password** (#5) and the credentials block in Swagger.
4. **Register `ThrottlerGuard` globally** and tighten auth-route throttles (#6); switch verification code to CSPRNG (#7); harden login error parity (#8).
5. **Password policy & validation hardening** (#10, #16) before the next user-facing form ships.
6. **Atomic refresh rotation** (#12) and drop or actually-use the hex token column (#13).
7. Logger hygiene (#14, #15) and dead-module cleanup (#18, #19) as a single PR.

## Skills to improve

- **Authorization design** — separate "authenticated" from "authorized"; deny by default; make the `request.user` contract part of the guard's type so the compiler enforces shape compatibility.
- **Threat-model files-as-tenants** — never expose generic key-addressed S3 routes; always project keys onto an owner.
- **AWS SDK literacy** — `Put*Command` vs `Get*Command` for presign is the kind of mismatch a typed wrapper (or contract test that issues a HEAD against the URL) would catch.
- **End-to-end testing of guards** — a single integration test that hits an annotated route as an `ADMIN` and as a regular user would have surfaced #1 immediately.
