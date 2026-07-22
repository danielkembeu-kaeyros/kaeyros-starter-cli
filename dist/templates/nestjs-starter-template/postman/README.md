# Postman E2E suite

Automated smoke test of every API endpoint.

## Files

| File                                     | Purpose                                                     |
| ---------------------------------------- | ----------------------------------------------------------- |
| `nestjs-starter.postman_collection.json` | The collection (import into Postman, or run with newman)    |
| `local.postman_environment.json`         | Environment: `baseUrl`, admin credentials, manual-flow vars |
| `sample.png`                             | 1×1 PNG fixture used by the file-upload request             |

## Run it

```bash
# 1. start the stack
npm run docker:dev          # or your own Postgres
npm run db:migrate:deploy
npm run db:seed             # needs INITIAL_SUPER_ADMIN_EMAIL / _PASSWORD in .env
npm run start:dev

# 2. edit postman/local.postman_environment.json:
#    adminEmail    = INITIAL_SUPER_ADMIN_EMAIL
#    adminPassword = INITIAL_SUPER_ADMIN_PASSWORD

# 3. run the suite (CLI)
npm run test:postman
```

Or in the Postman app: _Import_ both JSON files, select the environment, and use
**Run collection**. Re-select `sample.png` on the upload request the first time
(Postman resolves file paths per machine).

## What the scripts automate

- **Login + token chaining** — `POST /auth/login` stores `{{accessToken}}`;
  collection-level bearer auth applies it everywhere.
- **Forced first-login password change** — if the seeded super-admin still has
  `mustChangePassword=true`, the collection calls `change-initial-password`,
  persists the new password into the environment (`adminPassword`), and re-logs in.
  Subsequent runs skip these steps automatically.
- **Resource chaining** — creates permission → role (with that permission) →
  account (with that role), exercises every read/update endpoint against them,
  then deletes everything in the Cleanup folder. Safe to re-run.
- **Refresh cookie** — `POST /auth/refresh` relies on the `refreshToken` cookie
  set at login; Postman/newman keep the cookie jar within a run.

## Caveats

- **Throttling**: the whole `/auth` surface is rate-limited to **10 req/min**
  (hardcoded in `auth.controller.ts`). The automated flow stays under it, but
  don't re-run the Auth folder repeatedly within a minute or you'll see 429s.
- **Files folder**: needs real S3 credentials (`S3_BUCKET`, `S3_REGION`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`) — `s3` is the only storage
  provider shipped. Without them the upload test passes leniently (expects a
  4xx/5xx) and download/delete are skipped.
- **`99 Manual` folder**: endpoints that need an emailed token/code
  (verify-email, reset-password, OTP login). Skipped unless the environment
  variable `runManual=true`. With `EMAIL_PREVIEW_MODE=true` every email's
  Ethereal preview URL is printed in the server logs — grab the token/code
  there and fill `manualEmail` / `manualToken` / `manualCode`.
