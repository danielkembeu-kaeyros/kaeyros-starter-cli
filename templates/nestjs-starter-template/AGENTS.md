# Repository Guidelines

NestJS 10 + Prisma 7 + PostgreSQL starter with a zero-trust authorization model. The README has the deeper architecture tour; this file is for working on the codebase day-to-day.

## Project structure

```
src/
├── common/
│   ├── authz/         OwnershipResolverRegistry, RequestUser / JwtPayload types
│   ├── decorators/    @Public, @Authenticated, @RequirePermissions,
│   │                  @RequireAnyPermission, @CheckOwnership, @CurrentUser
│   ├── dto/           PaginationDto, BaseFiltersDto
│   ├── exceptions/    Custom HttpException subclasses
│   ├── filters/       AllExceptionsFilter (Prisma + Sentry aware)
│   ├── guards/        PermissionsGuard (deny-by-default), OwnershipGuard
│   ├── interceptors/  Logging, Performance, Version
│   ├── logging/       LoggerService, winstonConfig, DatabaseTransport
│   ├── middleware/    RequestContextMiddleware (UUID per request)
│   ├── pipes/         ValidationPipe (whitelist + forbidNonWhitelisted)
│   └── utils/         handlePrismaError
├── config/            Typed configuration + Sentry setup
├── i18n/              en/, fr/ JSON translations
├── modules/
│   ├── auth/          Login / register / refresh / verify / reset / change-password
│   │                  + OTP login (request-otp, verify-otp) per-account loginMethod
│   │                  + JwtAuthGuard, MustChangePasswordGuard, strategies
│   ├── users/         Public projection (/users, /users/me) backed by public_users view
│   ├── admin/         /admin/accounts, /admin/roles, /admin/permissions
│   │                  (each is a sub-module under admin/)
│   ├── audit/         AuditService, @Audit decorator, AuditInterceptor, /admin/audit
│   ├── sms/           SmsProvider interface + Twilio + null providers (@Global)
│   ├── storage/       StorageProvider interface + S3 implementation
│   │   └── files/     /files endpoints with @CheckOwnership demos
│   ├── jobs/          @nestjs/schedule crons (log + audit archival, token cleanup)
│   ├── email/         nodemailer + Handlebars templates (soft modern style)
│   ├── database/      PrismaService
│   ├── health/        /health via Terminus
│   └── aws/           Legacy AwsService (used by winston log archival until phase 10 sunsets it)
├── types/             auth.types and common.types
├── app.module.ts
└── main.ts

prisma/
├── schema.prisma      AccountKind, Account, Profile, Role, Permission,
│                      AccountRole, RolePermission, RefreshToken, PasswordReset,
│                      EmailVerification, AuditLog, Log, File + PublicUser / AdminDirectory views
├── migrations/
└── seed.ts            Permissions + roles + INITIAL_SUPER_ADMIN provisioning
```

Tests live next to code in `__tests__/` with `*.spec.ts`. E2E config is in `test/jest-e2e.json`.

## Globals registered in `app.module.ts`

`APP_FILTER`, `APP_PIPE`, `APP_INTERCEPTOR`, and the four global guards run in this order:

1. `ThrottlerGuard` (also `@Throttle({limit:10, ttl:60s})` on `AuthController`)
2. `JwtAuthGuard` (via `AuthModule`)
3. `MustChangePasswordGuard` (via `AuthModule`)
4. `PermissionsGuard` (via `AuthzModule`) — **deny by default**
5. `OwnershipGuard` (via `AuthzModule`) — runs when `@CheckOwnership` is set

`RequestContextMiddleware` applies to `*` and stamps `X-Request-Id`.

## Build, test, and development commands

- `npm run start:dev` — watch-mode API (`NODE_ENV=development`)
- `npm run build` — `nest build` (runs as the pre-commit smoke test)
- `npm run lint` — ESLint with autofix (skips tests)
- `npm run format` — Prettier
- `npm run typecheck` — `tsc --noEmit`
- `npm run test` / `test:watch` / `test:cov` — Jest unit suite (uses `DATABASE_URL_TEST`)
- `npm run test:e2e` — supertest e2e
- `npm run test:setup` — `./scripts/setup-test-db.sh`
- `npm run db:generate` / `db:migrate` / `db:migrate:deploy` / `db:seed` — Prisma flow
- `npm run docker:dev` / `docker:prod` — local + production stacks

## Coding style & naming

TypeScript with 2-space indentation, semicolons, single quotes (Prettier-enforced).

- Classes / providers / modules: `PascalCase`
- Variables / functions / methods: `camelCase`
- File suffixes by role: `*.controller.ts`, `*.service.ts`, `*.module.ts`, `*.guard.ts`, `*.dto.ts`, `*.interceptor.ts`, `*.filter.ts`, `*.pipe.ts`, `*.decorator.ts`, `*.config.ts`, `*.job.ts`
- Path aliases: `@/*`, `@common/*`, `@modules/*`, `@config/*`, `@types/*`
- Always inject `LoggerService`; never `console.*` outside the bootstrap fallback
- Throw custom exceptions from `src/common/exceptions/`, never `throw new Error(...)` in HTTP handlers
- Wrap multi-step writes in `prisma.$transaction`

The pre-commit hook (`husky` + `lint-staged`) runs ESLint, Prettier, and `npm run build`.

## Adding a feature

1. Create the module under `src/modules/<feature>/`. Suffix files by role.
2. Register the module in `app.module.ts` `imports`.
3. DTOs decorate every property with `class-validator` + `@ApiProperty`. `ValidationPipe` rejects unknown fields, so add `@MaxLength` and similar guards explicitly.
4. **Every authenticated route must declare authz metadata**. Use `@RequirePermissions(...)`, `@RequireAnyPermission(...)`, or `@Authenticated()`. Without one of these (or `@Public()`), `PermissionsGuard` denies — never a silent allow.
5. For owned-resource endpoints, add `@CheckOwnership({ resource, param })` AND register a resolver in your service via `OwnershipResolverRegistry.register('<resource>', async (id) => …)`.
6. Audit important state-changing routes with `@Audit({ action, resource })`, or call `AuditService.log(...)` directly for mid-service events.
7. Add unit tests in `<feature>/__tests__/`. Mock `PrismaService` and inject the real `OwnershipResolverRegistry` when testing guards.

## Testing guidelines

- Unit specs: `src/**/__tests__/*.spec.ts`
- E2E: `test/jest-e2e.json`
- Both require `DATABASE_URL_TEST` — bootstrap via `npm run test:setup`
- Focus coverage on: authz guards (deny-by-default, ownership), auth flows (login enumeration parity, atomic refresh, must-change-password lockout), Prisma error mapping, audit interceptor success/failure paths

## Commit & pull request guidelines

Recent history uses scoped conventional-commit subjects (`feat(auth):`, `chore(security):`, `feat(prisma):`). Keep commits scoped to one concern.

For PRs:

- Summary + rationale up top
- Linked issue / task IDs
- Call out DB migrations or new env vars (`.env.example` must be updated in the same PR)
- API examples or screenshots for behavioural changes
- Confirm locally: `npm run lint`, `npm run typecheck`, `npm run test:all`
- Note any new permission seed or RBAC change

## Known wiring conventions to remember

- `JwtStrategy.validate` returns the flat `RequestUser` shape (`id, email, kind, roles[], permissions[], ...`) — `PermissionsGuard` reads `permissions[]`. Never return the nested Prisma shape directly.
- `PermissionsGuard` and `OwnershipGuard` are deny-by-default. If a test starts failing with 403 on a new route, the missing piece is the authz decorator, not the guard.
- `AuditService` is `@Global` — inject it directly; no need to import `AuditModule`.
- `STORAGE_PROVIDER` and `SMS_PROVIDER` are DI tokens (`Symbol(...)`), not strings. Always `@Inject(STORAGE_PROVIDER)` / `@Inject(SMS_PROVIDER)` when consuming.
- `SmsProvider` falls back to a no-op `NullSmsProvider` when Twilio creds aren't set, so local dev keeps working. Code that depends on real SMS should check `smsProvider.isConfigured()`.
- `Account.loginMethod` decides which `/auth/login*` endpoints accept the request. `PASSWORD` and `OTP` are mutually exclusive at the endpoint level; `BOTH` accepts either. The frontend doesn't need to query the account before login — it sends the user to whichever endpoint the user picked.
- Admin invites: if `loginMethod=OTP`, no temp password is generated and `mustChangePassword=false`. Use `EmailService.sendOtpAdminInviteEmail` (not the password one).
- Refresh / reset / verification tokens are stored as sha256 hashes. The raw token is sent to the client and never persisted.
- `MustChangePasswordGuard` only lets `/auth/change-initial-password` and `/auth/logout` through while `mustChangePassword=true`. Mark new exceptions with `@AllowedWhilePasswordChange()`.
