# Implementation Plan — Auth/Users Rewrite

**Status legend:** ⏳ pending · 🔨 in progress · ✅ done · ❌ blocked

| Phase | Title                                            | Status | Commit  |
| ----: | ------------------------------------------------ | :----: | ------- |
|     0 | Implementation plan (this file)                  |   ✅   | 88a277b |
|     1 | Prisma schema + views + migration                |   ✅   | 9f44c9c |
|     2 | Seeds (permissions, roles, super admin via env)  |   ✅   | 25989d5 |
|     3 | Authz primitives (deny-by-default + ownership)   |   ✅   | 1002552 |
|     4 | Auth module rewrite                              |   ✅   | 68ce2f2 |
|     5 | Email templates (modern soft style)              |   ✅   | 5a98ea2 |
|     6 | Users module (public projection)                 |   ✅   | 6b1d2ed |
|     7 | Admin module + RBAC management                   |   ✅   | f79eb1a |
|     8 | Storage abstraction + S3 provider                |   ✅   | 1b1b78f |
|     9 | Audit log service + decorator + interceptor      |   ✅   | 8898adc |
|    10 | Cron jobs (archive + cleanup)                    |   ✅   | 1bd8d25 |
|    11 | Hardening (audit-report fixes)                   |   ✅   | b7ead10 |
|    12 | Tests + docs update                              |   ✅   | e856e3c |
|    13 | OTP login (per-account loginMethod + Twilio SMS) |   ✅   | 19ee828 |

Update the Status and Commit columns as each phase is committed. Add notes under the phase if scope shifts.

### Phase 13 notes

Per-account `Account.loginMethod` (PASSWORD | OTP | BOTH) decides which auth
endpoints accept the request. Two new public endpoints:

- `POST /auth/login/request-otp { email, channel? }` — silent 200, sends a
  6-digit OTP via email or SMS depending on `channel`.
- `POST /auth/login/verify-otp { email, code }` — same response shape as
  `/auth/login`.

`SmsProvider` is a new abstraction (`src/modules/sms/`) mirroring
`StorageProvider`: a DI token + a Twilio impl + a null fallback for dev.

Admin invite flow forks on `loginMethod`:

- `PASSWORD` / `BOTH`: existing temp-password + `mustChangePassword=true` flow.
- `OTP`: no temp password, `mustChangePassword=false`, sends
  `admin-invite-otp.hbs` directing the admin to `/auth/login/request-otp`.

`TokenCleanupJob` reaps `login_otps` rows past a 1-day grace window.

---

## Goals

1. **Single source of identity.** One `accounts` table holds all login data (email, password, verification state, must-change-password). A `kind` enum (`USER`, `ADMIN`, `SUPER_ADMIN`) discriminates the actor type at the DB level.
2. **Schema-level guarantee that public endpoints cannot return admins.** Public listings query the Postgres view `public_users` (`WHERE kind = 'USER'`) — there is no SQL path against the view that returns an admin. Admin listings query `admin_directory`.
3. **Zero-trust authorization.** Every authenticated route must declare an explicit permission. No permission metadata + no `@Public()` → `403 Forbidden`. The guards do not fail open.
4. **Permission-based, including ownership.** Permissions encode resource + action (`posts:read`, `posts:update`). A separate `@CheckOwnership` decorator pins down "act on your own row only" via a registered resolver per resource. The two compose so the controller stays declarative.
5. **Fix every S1/S2 from `docs/code-review-2026-05-29.en.md`.** No regressions: flat `roles`/`permissions` on `request.user`, `GetObjectCommand` for presigned downloads, no hardcoded admin password in code, throttler guard registered globally, `crypto.randomInt` for verification codes, login enumeration parity, atomic refresh rotation, deny-by-default guards, `forbidNonWhitelisted: true`, no `console.*`, no `throw new Error(...)` in HTTP handlers, no dead modules.
6. **Storage abstraction.** Application code never sees an S3 SDK. A `StorageProvider` interface backs upload/download/delete; the S3 implementation ships first; local-disk / Cloudinary / Azure are drop-ins for later phases.
7. **Operational hygiene.** Cron jobs archive and prune `logs` and `audit_logs` on a configurable schedule. Refresh tokens, email verifications, password resets are reaped on TTL.

## Non-goals (for this rewrite)

- Multi-tenant scoping. Roles and permissions are global.
- Email allowlisting / domain restrictions (can be added later as a guard).
- Social login. JWT/local only.
- Cloudinary / Azure / local-disk storage providers — interface only; ship S3 first.
- WebAuthn / passkeys / 2FA. Add later in a focused phase.

---

## Data model (Phase 1)

### Tables

```prisma
enum AccountKind {
  USER
  ADMIN
  SUPER_ADMIN
}

model Account {
  id                  String       @id @default(uuid())
  email               String       @unique
  password            String                          // bcrypt
  kind                AccountKind  @default(USER)
  isActive            Boolean      @default(true)
  isEmailVerified     Boolean      @default(false)
  emailVerifiedAt     DateTime?
  mustChangePassword  Boolean      @default(false)    // admins on first sign-in
  passwordChangedAt   DateTime?
  lastLoginAt         DateTime?
  failedLoginAttempts Int          @default(0)
  lockedUntil         DateTime?
  createdAt           DateTime     @default(now())
  updatedAt           DateTime     @updatedAt
  deletedAt           DateTime?
  createdBy           String?
  updatedBy           String?
  deletedBy           String?

  profile             Profile?
  refreshTokens       RefreshToken[]
  passwordResets      PasswordReset[]
  emailVerifications  EmailVerification[]
  accountRoles        AccountRole[]
  auditLogs           AuditLog[]   @relation("ActorAccount")

  @@index([email])
  @@index([kind])
  @@index([isActive])
  @@index([deletedAt])
  @@map("accounts")
}

model Profile {
  id        String   @id @default(uuid())
  accountId String   @unique
  firstName String?
  lastName  String?
  phone     String?
  avatar    String?                                   // storage key, not a URL
  bio       String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  account   Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)
  @@map("profiles")
}

model Role {
  id          String           @id @default(uuid())
  name        String           @unique
  description String?
  isSystem    Boolean          @default(false)        // cannot be deleted
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  deletedAt   DateTime?
  createdBy   String?
  permissions RolePermission[]
  accounts    AccountRole[]
  @@index([name])
  @@map("roles")
}

model Permission {
  id          String           @id @default(uuid())
  name        String           @unique               // "resource:action"
  resource    String
  action      String
  description String?
  isSystem    Boolean          @default(false)
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  roles       RolePermission[]
  @@index([name])
  @@index([resource])
  @@map("permissions")
}

model AccountRole {
  id        String   @id @default(uuid())
  accountId String
  roleId    String
  grantedBy String?
  createdAt DateTime @default(now())
  account   Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)
  role      Role     @relation(fields: [roleId], references: [id], onDelete: Cascade)
  @@unique([accountId, roleId])
  @@map("account_roles")
}

model RolePermission {
  id           String     @id @default(uuid())
  roleId       String
  permissionId String
  createdAt    DateTime   @default(now())
  role         Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)
  @@unique([roleId, permissionId])
  @@map("role_permissions")
}

model RefreshToken {
  id           String    @id @default(uuid())
  accountId    String
  tokenHash    String    @unique                      // sha256 of the actual token
  expiresAt    DateTime
  revokedAt    DateTime?
  replacedById String?   @unique                      // chain for rotation
  ipAddress    String?
  userAgent    String?
  createdAt    DateTime  @default(now())
  account      Account   @relation(fields: [accountId], references: [id], onDelete: Cascade)
  @@index([accountId])
  @@index([expiresAt])
  @@map("refresh_tokens")
}

model PasswordReset {
  id        String    @id @default(uuid())
  accountId String
  tokenHash String    @unique                         // sha256 of the token (never store raw)
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())
  account   Account   @relation(fields: [accountId], references: [id], onDelete: Cascade)
  @@index([accountId])
  @@index([expiresAt])
  @@map("password_resets")
}

model EmailVerification {
  id        String    @id @default(uuid())
  accountId String
  code      String                                    // 6 digits, crypto.randomInt
  tokenHash String    @unique                         // sha256 of the link token
  expiresAt DateTime
  usedAt    DateTime?
  attempts  Int       @default(0)                     // capped to prevent brute force
  createdAt DateTime  @default(now())
  account   Account   @relation(fields: [accountId], references: [id], onDelete: Cascade)
  @@index([accountId])
  @@index([tokenHash])
  @@index([expiresAt])
  @@map("email_verifications")
}

enum AuditAction {
  LOGIN
  LOGIN_FAILED
  LOGOUT
  PASSWORD_CHANGED
  PASSWORD_RESET_REQUESTED
  PASSWORD_RESET_COMPLETED
  EMAIL_VERIFIED
  ACCOUNT_CREATED
  ACCOUNT_UPDATED
  ACCOUNT_DISABLED
  ACCOUNT_ENABLED
  ACCOUNT_DELETED
  ROLE_CREATED
  ROLE_UPDATED
  ROLE_DELETED
  ROLE_GRANTED
  ROLE_REVOKED
  PERMISSION_CREATED
  PERMISSION_DELETED
  PERMISSION_ASSIGNED
  PERMISSION_REVOKED
  ADMIN_INVITED
  RESOURCE_ACCESSED
}

enum AuditStatus {
  SUCCESS
  FAILURE
}

model AuditLog {
  id             String       @id @default(uuid())
  actorAccountId String?
  actorEmail     String?
  action         AuditAction
  resource       String?
  resourceId     String?
  status         AuditStatus
  ipAddress      String?
  userAgent      String?
  metadata       Json?
  createdAt      DateTime     @default(now())
  archivedAt     DateTime?                            // set when shipped to storage
  actor          Account?     @relation("ActorAccount", fields: [actorAccountId], references: [id], onDelete: SetNull)
  @@index([actorAccountId])
  @@index([action])
  @@index([createdAt])
  @@index([archivedAt])
  @@map("audit_logs")
}

// Existing Log model is kept for application/Winston logs (separate from audit_logs).
```

### Views (created via raw SQL in the migration; Prisma `view` blocks map them as read-only models)

```sql
CREATE VIEW public_users AS
  SELECT a.id, a.email, a."isActive",
         p."firstName", p."lastName", p.avatar, p.bio,
         a."createdAt"
  FROM accounts a
  JOIN profiles p ON p."accountId" = a.id
  WHERE a.kind = 'USER'
    AND a."isActive" = true
    AND a."deletedAt" IS NULL;

CREATE VIEW admin_directory AS
  SELECT a.id, a.email, a.kind, a."isActive", a."lastLoginAt",
         p."firstName", p."lastName"
  FROM accounts a
  JOIN profiles p ON p."accountId" = a.id
  WHERE a.kind IN ('ADMIN','SUPER_ADMIN')
    AND a."deletedAt" IS NULL;
```

In Prisma (with `previewFeatures = ["views"]`):

```prisma
view PublicUser {
  id        String   @id
  email     String
  isActive  Boolean
  firstName String?
  lastName  String?
  avatar    String?
  bio       String?
  createdAt DateTime
  @@map("public_users")
}

view AdminDirectory {
  id          String      @id
  email       String
  kind        AccountKind
  isActive    Boolean
  lastLoginAt DateTime?
  firstName   String?
  lastName    String?
  @@map("admin_directory")
}
```

Public controllers depend on `PublicUser` only — they never import `Account`. Admin controllers depend on `Account` (writes) and `AdminDirectory` (listing). TypeScript catches mix-ups at compile time.

---

## Authorization (Phase 3)

### Decorators

- `@Public()` — skip authentication entirely. Use for `/health`, `/auth/login`, `/auth/register`, `/auth/refresh`, password reset, public link verification.
- `@RequirePermissions('a:b', 'c:d')` — caller must hold ALL listed permissions.
- `@RequireAnyPermission('a:b', 'c:d')` — caller must hold AT LEAST ONE.
- `@CheckOwnership({ param: 'id', resource: 'profile' })` — composed with permissions; runs after `PermissionsGuard` and verifies that the targeted record belongs to `request.user`.

### Guards (registered in `APP_GUARD`, in this order)

1. `JwtAuthGuard` — populates `request.user` from JWT (skips on `@Public()`).
2. `ThrottlerGuard` — global, with `@Throttle` overrides on `/auth/*`.
3. `MustChangePasswordGuard` — if `request.user.mustChangePassword === true`, only `/auth/change-initial-password` and `/auth/logout` are allowed; everything else returns `403`.
4. `PermissionsGuard` — **deny by default**: no `@RequirePermissions` and no `@RequireAnyPermission` and no `@Public()` → `403`.
5. `OwnershipGuard` — runs only if `@CheckOwnership` is set. Uses a resource resolver registry to load the record and compare its owner field to `request.user.id`.

### Permission naming

`<resource>:<action>` lowercase, colon-separated. Examples:

- `accounts:read`, `accounts:create`, `accounts:update`, `accounts:disable`
- `roles:read`, `roles:create`, `roles:update`, `roles:delete`, `roles:assign`
- `permissions:read`, `permissions:create`, `permissions:delete`, `permissions:assign`
- `profile:read:own`, `profile:update:own`
- `files:upload`, `files:read:own`, `files:delete:own`
- `audit:read`, `logs:read`

Permissions ending in `:own` indicate own-resource scope and pair with `@CheckOwnership` on the route. The "any"/admin variants don't carry the suffix.

### JWT payload + request.user shape

```ts
type JwtPayload = {
  sub: string; // account id
  kind: AccountKind;
  iat: number;
  exp: number;
};

// JwtStrategy.validate flattens before returning, so:
type RequestUser = {
  id: string;
  email: string;
  kind: AccountKind;
  isActive: boolean;
  isEmailVerified: boolean;
  mustChangePassword: boolean;
  roles: string[]; // role names
  permissions: string[]; // flattened permission names
};
```

`PermissionsGuard.canActivate` reads `request.user.permissions` — flat string array — so the contract is unambiguous and the bug from S1 #1 cannot recur.

---

## Auth flows (Phase 4)

### Registration (public)

1. POST `/auth/register { email, password, firstName?, lastName? }`
2. Validation: strong password (min 10, upper/lower/digit/symbol), valid email.
3. Insert in transaction: `account` (kind=USER, isEmailVerified=false), `profile`.
4. Assign default `USER` role.
5. Generate 6-digit code (`crypto.randomInt(100000, 1_000_000)`) + 32-byte link token; store sha256(token), expiry 15 minutes.
6. Send verification email (link + code).
7. Audit `ACCOUNT_CREATED`.
8. Issue access token + refresh cookie (the user is logged in but `isEmailVerified === false`).

### Login (public)

1. POST `/auth/login { email, password }`.
2. **Same response for unknown email / disabled / wrong password.** Always run `bcrypt.compare` against a real or dummy hash.
3. On success: increment `lastLoginAt`, reset `failedLoginAttempts`. Issue access + refresh.
4. On failure: increment `failedLoginAttempts`. If `>= 5`, set `lockedUntil = now + 15m`. Audit `LOGIN_FAILED`.
5. Audit `LOGIN` on success.

### Refresh (public)

1. POST `/auth/refresh` reads `refreshToken` cookie.
2. Verify JWT signature. Look up by `tokenHash`. Reject if revoked, expired, or replaced.
3. **Inside `prisma.$transaction`**: mark current row revoked + `replacedById = newId`, insert new row, return both tokens.
4. Refresh tokens chain so a stolen+rotated token is detectable (reuse of a revoked-but-known token triggers full revocation for the account).

### Logout

1. POST `/auth/logout` — revoke the current refresh token, clear the cookie.

### Email verification (public link + authenticated code)

- GET `/auth/verify-email?token=<raw>` — public; looks up by sha256(raw), marks `usedAt`, sets `isEmailVerified` on account.
- POST `/auth/verify-email { code }` — authenticated; compares to active code, caps attempts at 5.

### Password reset (public)

- POST `/auth/request-password-reset { email }` — always 200. If the account exists, issue a token (sha256 stored), email a link.
- POST `/auth/reset-password { token, newPassword }` — validate token, hash new password, revoke all refresh tokens for the account, audit `PASSWORD_RESET_COMPLETED`.

### Admin first sign-in (created by super admin)

1. Super admin POST `/admin/accounts { email, kind: ADMIN, firstName, lastName }`.
2. Service generates a random temporary password, sets `mustChangePassword: true`, sends an admin invite email containing the password + a "set your password" link.
3. Admin logs in — JWT issued — `MustChangePasswordGuard` blocks every route except `/auth/change-initial-password` and `/auth/logout`.
4. POST `/auth/change-initial-password { currentPassword, newPassword }` — validates current password, sets new password, clears flag, revokes all refresh tokens, audits `PASSWORD_CHANGED`.

---

## Storage (Phase 8)

```ts
export interface StorageProvider {
  upload(input: {
    key?: string;
    buffer: Buffer;
    mimeType: string;
    metadata?: Record<string, string>;
    ownerAccountId: string;
  }): Promise<{ key: string; size: number }>;

  delete(key: string): Promise<void>;

  getDownloadUrl(key: string, opts?: { expiresIn?: number; filename?: string }): Promise<string>;

  exists(key: string): Promise<boolean>;
}
```

Wired by token (`STORAGE_PROVIDER_TOKEN`) with a factory that selects implementation from `STORAGE_PROVIDER` env. Initial impl: `S3StorageProvider`.

- Keys always prefixed `accounts/<accountId>/<uuid>-<safe-filename>` server-side. Callers don't pick the prefix.
- Downloads use `GetObjectCommand` (fixes audit S1 #4).
- Uploads validated for MIME type allowlist and size (configurable per upload context).
- `AwsController` is removed; the only HTTP-level storage routes live under `/files/*` and are permission-gated.

---

## Audit logging (Phase 9)

- `AuditLogService.log(input, request?)` writes a row, capturing IP + UA from the request.
- `@Audit({ action, resource? })` method decorator. `AuditInterceptor` reads metadata, captures the actor, writes on success/failure.
- Direct calls remain available for events that don't map cleanly to a single endpoint (e.g., job-side audit).

---

## Cron jobs (Phase 10)

Using `@nestjs/schedule`. Configurable cron expressions:

- **`LogArchiveJob`** — daily 02:00 — uploads `logs` rows older than `LOG_ARCHIVE_AFTER_DAYS` (default 30) to storage, then deletes them.
- **`AuditLogArchiveJob`** — daily 02:30 — same shape for `audit_logs`; archive after `AUDIT_ARCHIVE_AFTER_DAYS` (default 90), delete after `AUDIT_RETENTION_DAYS` (default 365).
- **`RefreshTokenCleanupJob`** — hourly — deletes expired refresh tokens.
- **`EmailVerificationCleanupJob`** — hourly — deletes expired email verifications.
- **`PasswordResetCleanupJob`** — hourly — deletes expired password resets.

All jobs use `LoggerService` and emit a final audit row summarizing the run.

---

## Seeded data (Phase 2)

### Permissions (system, isSystem=true)

```
accounts:read, accounts:create, accounts:update, accounts:disable, accounts:delete
roles:read, roles:create, roles:update, roles:delete, roles:assign
permissions:read, permissions:create, permissions:delete, permissions:assign
profile:read:own, profile:update:own
files:upload, files:read:own, files:delete:own
audit:read, logs:read
```

### Roles (system, isSystem=true)

- `SUPER_ADMIN` — every permission.
- `ADMIN` — everything except `roles:*` write actions and `permissions:create/delete`.
- `USER` — `profile:read:own`, `profile:update:own`, `files:upload`, `files:read:own`, `files:delete:own`.

### Super admin account

- Provisioned only when `INITIAL_SUPER_ADMIN_EMAIL` and `INITIAL_SUPER_ADMIN_PASSWORD` are set.
- Boot fails fast if those vars are missing on a fresh database with no existing super admin.
- The seeded account has `kind=SUPER_ADMIN`, `mustChangePassword=true`, `isEmailVerified=true`.
- No hardcoded credentials anywhere in the repo or the Swagger description.

---

## Env additions

```
# Initial bootstrap (required on first boot only)
INITIAL_SUPER_ADMIN_EMAIL=
INITIAL_SUPER_ADMIN_PASSWORD=

# Storage
STORAGE_PROVIDER=s3
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
STORAGE_MAX_UPLOAD_BYTES=10485760
STORAGE_ALLOWED_MIME=image/png,image/jpeg,image/webp,application/pdf

# Retention
LOG_ARCHIVE_AFTER_DAYS=30
AUDIT_ARCHIVE_AFTER_DAYS=90
AUDIT_RETENTION_DAYS=365

# Auth tuning
EMAIL_VERIFICATION_TTL_MINUTES=15
PASSWORD_RESET_TTL_MINUTES=60
LOGIN_LOCKOUT_THRESHOLD=5
LOGIN_LOCKOUT_DURATION_MINUTES=15
```

`AWS_*` keys from the old config are removed; the storage provider owns its own keys.

---

## Audit-report fixes baked into the rewrite

| Report finding                               | Where it's addressed                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| S1 #1 flat roles/permissions on request.user | Phase 3 — JwtStrategy returns a flat shape; PermissionsGuard reads flat fields.                                                       |
| S1 #2 silent-allow @Authorize family         | The whole family is deleted; only `@RequirePermissions` / `@RequireAnyPermission` exist.                                              |
| S1 #3 AwsController open to any user         | Phase 8 — controller deleted; `/files/*` permission-gated, per-account prefix.                                                        |
| S1 #4 PUT presigned instead of GET           | Phase 8 — `GetObjectCommand` for downloads.                                                                                           |
| S1 #5 hardcoded admin password               | Phase 2 — `INITIAL_SUPER_ADMIN_*` env, fail-fast on first boot.                                                                       |
| S2 #6 ThrottlerGuard not registered          | Phase 11 — registered globally, stricter `@Throttle` on `/auth/*`.                                                                    |
| S2 #7 Math.random verification code          | Phase 4 — `crypto.randomInt`.                                                                                                         |
| S2 #8 login enumeration                      | Phase 4 — uniform response, dummy bcrypt compare on unknown email.                                                                    |
| S2 #9 guards fail open                       | Phase 3 — deny by default.                                                                                                            |
| S2 #10 weak register password                | Phase 4 — single strong-password validator shared with reset.                                                                         |
| S3 #12 non-atomic refresh rotation           | Phase 4 — `prisma.$transaction` around revoke + insert.                                                                               |
| S3 #13 dead hex token column                 | Phase 1 — refresh tokens now stored as sha256 hashes; the JWT carries the raw, the DB carries the hash, and the lookup uses the hash. |
| S3 #14 console.\*                            | Phase 4 + Phase 11 — `LoggerService` everywhere.                                                                                      |
| S3 #15 throw new Error                       | Phase 4 onwards — custom `HttpException` subclasses.                                                                                  |
| S3 #16 forbidNonWhitelisted false            | Phase 11 — set to true.                                                                                                               |
| S4 #18 UsersModule placeholder               | Phase 6 — implemented.                                                                                                                |
| S4 #19 LogsModule commented out              | Phase 10 — re-wired (now operational, gated by `logs:read`).                                                                          |
| S4 #20 JwtPayload optional drift             | Phase 4 — required fields only.                                                                                                       |

---

## Commits

Each phase ships as a single focused commit (or two if a phase splits cleanly). Commit subjects stay under ~70 chars and use the conventional prefix.

```
docs: add implementation plan for auth/users rewrite           # phase 0
feat(prisma): accounts/profiles/RBAC/audit schema with views    # phase 1
feat(seed): permissions, roles, super admin via env             # phase 2
feat(authz): deny-by-default guards and permission decorators   # phase 3
feat(authz): ownership guard with resource resolver registry    # phase 3 (split if needed)
feat(auth): rewrite auth module with login/register/refresh     # phase 4
feat(auth): admin first-sign-in password change flow            # phase 4 (split if needed)
feat(email): modern soft-style verification + reset templates   # phase 5
feat(users): public users module backed by view                 # phase 6
feat(admin): admin accounts CRUD and RBAC management            # phase 7
feat(storage): storage provider abstraction with S3 impl        # phase 8
feat(audit): audit log service, decorator, interceptor          # phase 9
feat(cron): log/audit archival and cleanup jobs                 # phase 10
chore(security): global throttler + validation pipe hardening   # phase 11
test: integration coverage for auth, authz, ownership           # phase 12
docs: update README and AGENTS for new architecture             # phase 12
```

Reviewers can `git log --oneline` to walk the rewrite linearly.

---

## Notes / open questions to revisit per phase

- **Phase 1.** Prisma view support requires `previewFeatures = ["views"]`. Migration creates views via raw SQL after the tables are in place.
- **Phase 3.** Owner-field resolution: a simple registry mapping `resource → (id) => Promise<{ ownerAccountId } | null>` keeps the guard free of imports from feature modules.
- **Phase 4.** The "must change password" flag also applies on full password resets — clearing the flag once the new password is set, regardless of which endpoint did the change.
- **Phase 8.** `MIME` allowlist is a config string; per-route overrides via a `@AllowMime(...)` decorator if needed later.
- **Phase 11.** Throttler bucket key includes IP + (if authenticated) account id so authenticated callers don't share a bucket with anonymous traffic from the same IP.
- **Phase 12.** Keep `code-review-2026-05-29.en.md` / `.fr.md` as a reference. Add a "Fix log" cross-reference to each report finding pointing at the commit that addressed it.
