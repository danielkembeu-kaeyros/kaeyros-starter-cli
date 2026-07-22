# NestJS Enterprise Starter

A NestJS 10 + Prisma 7 + PostgreSQL starter built around a **zero-trust authorization** model. One `Account` table holds every identity (USER, ADMIN, SUPER_ADMIN); public listings are backed by a Postgres view so admins can never leak through them. Roles and permissions are managed via the API. Email verification, refresh-token rotation, admin first-sign-in, audit logging, scheduled archival, and a pluggable storage layer all ship out of the box.

> The rewrite that produced this layout is documented in `docs/implementation-plan.md`. The threat model and design rationale live in `docs/admin-users-architecture.fr.md` (French) and `docs/code-review-2026-05-29.en.md` / `.fr.md`.

## Table of contents

- [Architecture at a glance](#architecture-at-a-glance)
- [Quick start](#quick-start)
- [Endpoints](#endpoints)
- [Authorization model](#authorization-model)
- [Schema](#schema)
- [Environment variables](#environment-variables)
- [npm scripts](#npm-scripts)
- [Audit logging](#audit-logging)
- [Storage](#storage)
- [Cron jobs](#cron-jobs)
- [Testing](#testing)
- [Production checklist](#production-checklist)

## Architecture at a glance

| Concern                                                | Where                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Identity (login + verification + must-change-password) | `accounts` table with `kind` discriminator                                           |
| Profile (shared fields)                                | `profiles` table, 1:1 with `accounts`, cascade delete                                |
| Public user listing                                    | `public_users` Postgres view — `WHERE kind = 'USER'` baked in                        |
| Admin directory                                        | `admin_directory` Postgres view — `WHERE kind IN ('ADMIN','SUPER_ADMIN')`            |
| RBAC                                                   | `roles`, `permissions`, `account_roles`, `role_permissions` (all global)             |
| Refresh / reset / verification tokens                  | sha256 hashes stored, raw bytes never persisted                                      |
| Login method                                           | `Account.loginMethod` ∈ {`PASSWORD`, `OTP`, `BOTH`}; OTP rows in `login_otps` table  |
| OTP delivery                                           | Email (existing) + SMS via `SmsProvider` (Twilio + null providers)                   |
| Audit log                                              | `audit_logs` (separate from app `logs`) with archive + retention crons               |
| File storage                                           | `files` table referencing per-account-prefixed keys in a pluggable `StorageProvider` |

Guard order (registered globally in `app.module.ts`):

1. `ThrottlerGuard` — rate limit before any other work
2. `JwtAuthGuard` — populates `request.user` (skips `@Public()`)
3. `MustChangePasswordGuard` — locks admin first-sign-in to the change-initial-password loop
4. `PermissionsGuard` — **deny by default**: route without `@RequirePermissions` / `@RequireAnyPermission` / `@Authenticated` / `@Public` → 403
5. `OwnershipGuard` — when `@CheckOwnership` is declared, verifies the targeted row belongs to the caller

## Quick start

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9
- PostgreSQL 13+

### Setup

```bash
git clone <your-repo-url>
cd nestjs-starter
npm install

# 1. Configure the database + the initial super admin
cp .env.example .env
# Edit .env — at minimum:
#   DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET
#   INITIAL_SUPER_ADMIN_EMAIL, INITIAL_SUPER_ADMIN_PASSWORD (10+ chars, upper+lower+digit+symbol)

# 2. Apply the migration + seed
npm run db:generate
npm run db:migrate:deploy        # or db:migrate for dev with shadow DB
npm run db:seed

# 3. Start
npm run start:dev
```

The API listens on `http://localhost:3000/api`; Swagger at `http://localhost:3000/docs`.

### First boot dance

The seeded super admin has `mustChangePassword=true` and is locked into the change-initial-password loop on login:

```bash
# 1. Login
curl -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -c /tmp/cookies.txt \
  -d '{"email":"<INITIAL_SUPER_ADMIN_EMAIL>","password":"<INITIAL_SUPER_ADMIN_PASSWORD>"}'

# 2. Most routes return 403 ("you must change your initial password") until this completes:
curl -X POST http://localhost:3000/api/auth/change-initial-password \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer <accessToken>" \
  -d '{"currentPassword":"<INITIAL>","newPassword":"<NEW_STRONG_PASSWORD>"}'

# 3. Login again with the new password to get a fresh token; the lockout is now lifted.
```

## Endpoints

### Public (`@Public()`)

| Method | Path                           | Description                                                                             |
| ------ | ------------------------------ | --------------------------------------------------------------------------------------- |
| POST   | `/auth/register`               | Self-registration. Sends verification email. No tokens until verified.                  |
| POST   | `/auth/login`                  | Email + password → access token (body) + refresh cookie. Refused for OTP-only accounts. |
| POST   | `/auth/login/request-otp`      | Silent (always 200) — sends a 6-digit OTP via email or SMS (per `channel`).             |
| POST   | `/auth/login/verify-otp`       | Submit `{ email, code }` → same response as `/auth/login`.                              |
| POST   | `/auth/refresh`                | Rotate the refresh cookie + return a new access token.                                  |
| POST   | `/auth/verify-email/code`      | Submit `{ email, code }` from the verification email.                                   |
| POST   | `/auth/verify-email/link`      | Submit `{ token }` from the verification email link.                                    |
| GET    | `/auth/verify-email?token=…`   | GET shortcut for the verification link.                                                 |
| POST   | `/auth/resend-verification`    | Silent (always 200) — resend the verification email.                                    |
| POST   | `/auth/request-password-reset` | Silent (always 200) — emails a reset link.                                              |
| POST   | `/auth/reset-password`         | Consume the reset token and choose a new password.                                      |
| GET    | `/health`                      | Liveness via `@nestjs/terminus`.                                                        |

### Authenticated (`@Authenticated()` or `@RequirePermissions(...)`)

| Method | Path                            | Permission                             | Description                                                                 |
| ------ | ------------------------------- | -------------------------------------- | --------------------------------------------------------------------------- |
| POST   | `/auth/logout`                  | `@Authenticated`                       | Revoke the refresh token; clear cookie. Allowed during password change.     |
| GET    | `/auth/me`                      | `@Authenticated`                       | Current user with roles + permissions.                                      |
| POST   | `/auth/change-password`         | `@Authenticated`                       | Change own password.                                                        |
| POST   | `/auth/change-initial-password` | `@Authenticated`                       | Complete the admin first-sign-in. Allowed during password change.           |
| GET    | `/users/me`                     | `@Authenticated`                       | Own profile (works for users and admins).                                   |
| PATCH  | `/users/me`                     | `profile:update:own`                   | Update own profile fields.                                                  |
| GET    | `/users`                        | `accounts:read`                        | Paginated list of end-users — admins NEVER appear (the view excludes them). |
| GET    | `/users/:id`                    | `accounts:read`                        | Get a single end-user.                                                      |
| POST   | `/files`                        | `files:upload`                         | Upload a file (10 MB cap, MIME allowlist).                                  |
| GET    | `/files/me`                     | `files:read:own`                       | List your own files.                                                        |
| GET    | `/files/:id/download`           | `files:read:own` + `@CheckOwnership`   | Presigned GET URL (1 h).                                                    |
| DELETE | `/files/:id`                    | `files:delete:own` + `@CheckOwnership` | Soft-delete.                                                                |

### Admin (`/admin/*`)

| Method                      | Path                                      | Permission                                              | Description                                                       |
| --------------------------- | ----------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------- | ------- | --------------------------------- | --------------------------- |
| GET / POST / PATCH          | `/admin/accounts[/:id]`                   | `accounts:read` / `accounts:create` / `accounts:update` | List, create (sends admin-invite email when kind ≠ USER), update. |
| POST                        | `/admin/accounts/:id/disable` & `/enable` | `accounts:disable`                                      | Disable revokes all refresh tokens.                               |
| DELETE                      | `/admin/accounts/:id`                     | `accounts:delete`                                       | Hard delete (cannot delete yourself).                             |
| PUT                         | `/admin/accounts/:id/roles`               | `roles:assign`                                          | Replace the account roles.                                        |
| GET / POST / PATCH / DELETE | `/admin/roles[/:id]`                      | `roles:read                                             | create                                                            | update  | delete`                           | System roles are read-only. |
| PUT                         | `/admin/roles/:id/permissions`            | `permissions:assign`                                    | Replace role permissions.                                         |
| GET / POST / DELETE         | `/admin/permissions[/:id]`                | `permissions:read                                       | create                                                            | delete` | System permissions are read-only. |
| GET                         | `/admin/audit`                            | `audit:read`                                            | Filterable audit log listing.                                     |

## Authorization model

Permission names follow `resource:action[:scope]`. `:own` indicates own-resource scope and pairs with `@CheckOwnership` to load the targeted record and compare its `ownerAccountId` against `request.user.id`.

### Seeded RBAC

- **SUPER_ADMIN** — every permission. Can create another super admin and grant the `SUPER_ADMIN` role.
- **ADMIN** — operates accounts; reads audit and logs. Cannot edit the RBAC structure.
- **USER** — `profile:read:own`, `profile:update:own`, `files:upload`, `files:read:own`, `files:delete:own`.

### Authoring a new endpoint

```ts
import { RequirePermissions } from '@common/decorators/require-permissions.decorator';
import { CheckOwnership } from '@common/decorators/check-ownership.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';

@RequirePermissions('posts:update:own')
@CheckOwnership({ resource: 'post', param: 'id' })
@Patch(':id')
update(@Param('id') id: string, @Body() dto: UpdatePostDto, @CurrentUser('id') accountId: string) {
  return this.postsService.update(id, dto, accountId);
}
```

…and register the resolver in the feature module:

```ts
@Injectable()
export class PostsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: OwnershipResolverRegistry,
  ) {}
  onModuleInit() {
    this.registry.register('post', async (id) => {
      const post = await this.prisma.post.findUnique({ where: { id }, select: { authorId: true } });
      return post ? { ownerAccountId: post.authorId } : null;
    });
  }
}
```

If you forget the decorator, the route is denied (`PermissionsGuard` is deny-by-default). If you forget the resolver, the request returns 500 — never a silent allow.

## OTP login

Each account carries a `loginMethod` (`PASSWORD` | `OTP` | `BOTH`, default `PASSWORD`). Super admin sets it via `PATCH /admin/accounts/:id { loginMethod: 'OTP' }`.

```
PASSWORD     /auth/login works.   /auth/login/request-otp refused silently.
OTP          /auth/login refused. /auth/login/request-otp works.
BOTH         Both flows work. The frontend picks per attempt.
```

OTP flow (email or SMS):

```
POST /auth/login/request-otp { email, channel?: 'EMAIL' | 'SMS' }   → 200 silent
POST /auth/login/verify-otp  { email, code }                        → 200 + tokens
```

- 6-digit code via `crypto.randomInt`, configurable length and TTL (`LOGIN_OTP_TTL_MINUTES`, default 5 min).
- Attempt cap of 5 per code; exceeding the cap voids the OTP.
- SMS dispatch requires `Profile.phone` on the account; missing phone = silent miss (no enumeration).
- `request-otp` is silent (always 200) regardless of whether the email exists or the account is OTP-eligible. The frontend just says "if your account is eligible, a code has been sent."

### Admin invite for OTP-only admins

When super admin creates an admin with `loginMethod: 'OTP'`:

- No temp password is generated; `account.password` gets a random unguessable hash never sent to anyone.
- `mustChangePassword` stays `false` (nothing to rotate).
- The `admin-invite-otp.hbs` email is sent instead of `admin-invite.hbs`: "Your admin account is ready — request a sign-in code at /auth/login/request-otp."
- The admin signs in via the regular OTP flow on day one.

For `BOTH`, the temp-password + `mustChangePassword=true` flow is kept (they need a password they can rotate). For `PASSWORD`, the current flow is unchanged.

## Schema

```
accounts            id, email, password, kind (USER|ADMIN|SUPER_ADMIN),
                    loginMethod (PASSWORD|OTP|BOTH),
                    isActive, isEmailVerified, mustChangePassword,
                    lastLoginAt, failedLoginAttempts, lockedUntil, ...
profiles            1:1 with accounts (firstName, lastName, phone, avatar, bio)
roles, permissions, account_roles, role_permissions
refresh_tokens      tokenHash (sha256), expiresAt, revokedAt, replacedById
password_resets     tokenHash, expiresAt, usedAt
email_verifications code, tokenHash, expiresAt, attempts, usedAt
login_otps          code, channel (EMAIL|SMS), expiresAt, attempts, usedAt
audit_logs          actorAccountId, action, resource, status, metadata, ipAddress, ...
logs                application logs (winston DB transport)
files               accountId, storageKey, mimeType, size, ...

public_users        VIEW — accounts JOIN profiles WHERE kind = 'USER' AND isActive
admin_directory     VIEW — accounts JOIN profiles WHERE kind IN ('ADMIN','SUPER_ADMIN')
```

## Environment variables

The environment is validated **at startup** by `src/config/env.validation.ts`
(wired into `ConfigModule` via `validate`). If a required variable is missing or
malformed the process refuses to boot and prints a single aggregated error
listing every problem at once — no more discovering a bad config deep inside a
request handler. Validation is env-aware: secrets and provider credentials are
enforced only when `APP_ENV`/`NODE_ENV` is `staging` or `production`, so
development and test stay frictionless. See `.env.example` for the full set.

### Required everywhere

| Key                 | Notes                        |
| ------------------- | ---------------------------- |
| `DATABASE_URL`      | PostgreSQL connection string |
| `DATABASE_URL_TEST` | Used by Jest                 |

### Required in staging / production

| Key                  | Notes                                                                              |
| -------------------- | ---------------------------------------------------------------------------------- |
| `JWT_SECRET`         | Min 32 chars                                                                       |
| `JWT_REFRESH_SECRET` | Min 32 chars                                                                       |
| Provider creds       | Per selected provider: `S3_*` (s3), `TWILIO_*` (twilio), SMTP/SES/SendGrid (email) |

### Initial super admin (first boot only)

| Key                            | Notes                                        |
| ------------------------------ | -------------------------------------------- |
| `INITIAL_SUPER_ADMIN_EMAIL`    | Provisioned by `npm run db:seed`             |
| `INITIAL_SUPER_ADMIN_PASSWORD` | Min 10 chars, upper + lower + digit + symbol |

### Auth tuning

| Key                               | Default               |
| --------------------------------- | --------------------- |
| `JWT_EXPIRES_IN`                  | `15m`                 |
| `JWT_REFRESH_EXPIRES_IN`          | `7d`                  |
| `BCRYPT_ROUNDS`                   | `12`                  |
| `EMAIL_VERIFICATION_TTL_MINUTES`  | `15`                  |
| `PASSWORD_RESET_TTL_MINUTES`      | `60`                  |
| `LOGIN_LOCKOUT_THRESHOLD`         | `5`                   |
| `LOGIN_LOCKOUT_DURATION_MINUTES`  | `15`                  |
| `VERIFICATION_CODE_LENGTH`        | `6`                   |
| `LOGIN_OTP_TTL_MINUTES`           | `5`                   |
| `THROTTLE_TTL` / `THROTTLE_LIMIT` | `60` / `100` (global) |

### SMS (used by OTP login when an account opts in via SMS)

| Key                                                               | Default  |
| ----------------------------------------------------------------- | -------- |
| `SMS_PROVIDER`                                                    | `twilio` |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | —        |

If Twilio creds aren't set, the `null` provider takes over and logs outbound messages instead of sending them. Local dev keeps working with no Twilio account.

### Storage

| Key                                                                     | Default                                                     |
| ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| `STORAGE_PROVIDER`                                                      | `s3`                                                        |
| `S3_BUCKET` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | —                                                           |
| `STORAGE_MAX_UPLOAD_BYTES`                                              | `10485760` (10 MB)                                          |
| `STORAGE_ALLOWED_MIME`                                                  | `image/png,image/jpeg,image/webp,image/gif,application/pdf` |

### Retention (cron windows)

| Key                        | Default |
| -------------------------- | ------- |
| `LOG_ARCHIVE_AFTER_DAYS`   | `30`    |
| `AUDIT_ARCHIVE_AFTER_DAYS` | `30`    |
| `AUDIT_RETENTION_DAYS`     | `90`    |

## npm scripts

```bash
npm run start:dev            # watch-mode API
npm run build                # production build (also runs as the pre-commit smoke test)
npm run lint / typecheck     # ESLint + tsc --noEmit
npm run test                 # Jest unit suite (uses DATABASE_URL_TEST)
npm run test:e2e             # supertest e2e
npm run test:all             # setup test DB + unit + e2e

npm run db:generate          # prisma generate
npm run db:migrate           # prisma migrate dev (with shadow DB)
npm run db:migrate:deploy    # prisma migrate deploy (production)
npm run db:seed              # idempotent — provisions permissions, roles, and the initial super admin

npm run docker:dev / prod    # local + production stacks
```

## Audit logging

Every state-changing controller method on `/admin/*` and the auth lifecycle events (LOGIN, LOGIN_FAILED, LOGOUT, ACCOUNT_CREATED, EMAIL_VERIFIED, PASSWORD_CHANGED, PASSWORD_RESET_REQUESTED, PASSWORD_RESET_COMPLETED) write a row to `audit_logs`. Two integration paths:

- **Declarative** (controllers): `@Audit({ action: AuditAction.ROLE_CREATED, resource: 'role' })`. `AuditInterceptor` writes on success **and** failure.
- **Imperative** (services): `AuditService.log({ action, actorAccountId, ... }, request?)`. Used by `AuthService` for events that fire mid-request before `request.user` exists (e.g. `LOGIN_FAILED`).

`AuditService` is `@Global`, so any provider can inject it. Failures to persist the audit row are logged but never thrown — the underlying request must succeed.

`GET /admin/audit?action=...&actorAccountId=...&from=...&to=...` for filtered reads (gated by `audit:read`).

## Storage

```ts
@Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider;

await storage.put({ key, body, mimeType, metadata });
await storage.remove(key);
const url = await storage.getDownloadUrl(key, { expiresIn: 3600 });
```

S3 ships as the first concrete provider. Local-disk / Cloudinary / Azure drop into `src/modules/storage/providers/` and slot into the factory in `storage.module.ts`. Application code does **not** import any SDK.

`FilesService` enforces:

- Per-account key prefix `accounts/<accountId>/<uuid>-<safe-filename>`
- MIME allowlist (`STORAGE_ALLOWED_MIME`)
- Size cap (`STORAGE_MAX_UPLOAD_BYTES`)
- Presigned **GET** for downloads (never a PUT URL)

## Cron jobs

`JobsModule` (uses `@nestjs/schedule`):

- **LogArchiveJob** — daily 02:00. Gzipped JSONL of logs older than `LOG_ARCHIVE_AFTER_DAYS` uploaded to `archives/logs/<date>.jsonl.gz`, then deleted from the DB.
- **AuditArchiveJob** — daily 02:30 archives `audit_logs` to `archives/audit-logs/...` and stamps `archivedAt`. Daily 03:00 purges archived rows older than `AUDIT_RETENTION_DAYS`.
- **TokenCleanupJob** — hourly. Sweeps expired refresh tokens (30-day grace), email verifications and password resets (7-day grace).

## Testing

```bash
npm run test           # Jest unit
npm run test:e2e       # supertest e2e (uses test/jest-e2e.json)
npm run test:setup     # bootstrap the test DB via scripts/setup-test-db.sh
npm run test:all       # setup + unit + e2e
```

The new authz layer ships with focused unit specs:

- `src/common/guards/__tests__/permissions.guard.spec.ts` — deny-by-default semantics, `@RequirePermissions`, `@RequireAnyPermission`, `@Public`, `@Authenticated`.
- `src/common/guards/__tests__/ownership.guard.spec.ts` — registry lookup, 401 / 404 / 403 / 500 paths.

## Production checklist

1. `INITIAL_SUPER_ADMIN_*` set on first boot, then **never again** after the row exists.
2. `JWT_SECRET` and `JWT_REFRESH_SECRET` set to strong random values.
3. `CORS_ORIGIN` pinned (no wildcard).
4. `SWAGGER_ENABLED=false` in production or restrict by domain.
5. Storage credentials live in the deployment secret manager; `.env` never committed.
6. `LOG_DB_ENABLED=true` only if you want Winston writes in the DB; the cron archival assumes you do.
7. Run `npm run db:migrate:deploy` then `npm run db:seed` as part of the deploy pipeline.
8. Confirm cron output lands in `archives/...` of the configured bucket within the first 24 h.

## License

MIT.
