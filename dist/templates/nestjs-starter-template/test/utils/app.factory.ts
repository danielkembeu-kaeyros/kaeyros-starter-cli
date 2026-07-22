import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/modules/database/prisma.service';
import { EmailService } from '../../src/modules/email/email.service';
import { STORAGE_PROVIDER } from '../../src/modules/storage/storage.types';
import { SMS_PROVIDER } from '../../src/modules/sms/sms.types';
import { FakeEmailService, FakeSmsProvider, FakeStorageProvider } from './fakes';
import { resetData } from './db';
import { seedRbac } from './seed-rbac';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  email: FakeEmailService;
  sms: FakeSmsProvider;
  storage: FakeStorageProvider;
  /** Wipe per-test data (keeps the seeded RBAC catalogue). */
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

/**
 * Boots the full AppModule against the real test database, mirroring the global
 * setup in `src/main.ts` (prefix `api`, URI versioning, cookie-parser). All
 * external I/O — email, SMS, object storage — is replaced with recording fakes,
 * and the rate limiter is disabled so auth specs don't flake on the 10/60s cap.
 */
export async function createTestApp(): Promise<TestContext> {
  const email = new FakeEmailService();
  const sms = new FakeSmsProvider();
  const storage = new FakeStorageProvider();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EmailService)
    .useValue(email)
    .overrideProvider(STORAGE_PROVIDER)
    .useValue(storage)
    .overrideProvider(SMS_PROVIDER)
    .useValue(sms)
    // Disable rate limiting in e2e. The ThrottlerGuard is an APP_GUARD, which
    // .overrideGuard() cannot replace, so we neutralise its storage instead:
    // every request reports zero prior hits and is never blocked.
    .overrideProvider(ThrottlerStorage)
    .useValue({
      increment: async () => ({
        totalHits: 0,
        timeToExpire: 0,
        isBlocked: false,
        timeToBlockExpire: 0,
      }),
    })
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI });
  await app.init();

  const prisma = app.get(PrismaService);
  await seedRbac(prisma);

  return {
    app,
    prisma,
    email,
    sms,
    storage,
    reset: async () => {
      await resetData(prisma);
      email.reset();
      sms.reset();
    },
    close: async () => {
      await app.close();
    },
  };
}
