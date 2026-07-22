import { validateEnv } from '../env.validation';

/**
 * The validated config object is keyed by raw env var names, so tests build
 * plain records mirroring `process.env`.
 */
function env(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...overrides };
}

const STRONG_SECRET = 'a'.repeat(40);

describe('validateEnv', () => {
  describe('DATABASE_URL (always required)', () => {
    it('throws when DATABASE_URL is missing', () => {
      expect(() => validateEnv(env({ APP_ENV: 'development' }))).toThrow(
        /DATABASE_URL is required/,
      );
    });

    it('throws when DATABASE_URL is an empty string', () => {
      expect(() => validateEnv(env({ DATABASE_URL: '', APP_ENV: 'development' }))).toThrow(
        /DATABASE_URL is required/,
      );
    });

    it('passes in development with only DATABASE_URL set', () => {
      const result = validateEnv(env({ DATABASE_URL: 'postgresql://x', APP_ENV: 'development' }));
      expect(result.DATABASE_URL).toBe('postgresql://x');
    });

    it('passes in test env with only DATABASE_URL set', () => {
      expect(() =>
        validateEnv(env({ DATABASE_URL: 'postgresql://x', NODE_ENV: 'test' })),
      ).not.toThrow();
    });
  });

  describe('JWT secrets (required in staging/production)', () => {
    it('does NOT require JWT secrets in development', () => {
      expect(() =>
        validateEnv(env({ DATABASE_URL: 'postgresql://x', APP_ENV: 'development' })),
      ).not.toThrow();
    });

    it('throws when JWT secrets are missing in production', () => {
      expect(() =>
        validateEnv(env({ DATABASE_URL: 'postgresql://x', APP_ENV: 'production' })),
      ).toThrow(/JWT_SECRET must be set to at least 32 characters/);
    });

    it('throws when JWT secrets are too short in production', () => {
      expect(() =>
        validateEnv(
          env({
            DATABASE_URL: 'postgresql://x',
            APP_ENV: 'production',
            JWT_SECRET: 'short',
            JWT_REFRESH_SECRET: 'short',
          }),
        ),
      ).toThrow(/JWT_SECRET must be set to at least 32 characters/);
    });

    it('treats NODE_ENV=production as prod-like even without APP_ENV', () => {
      expect(() =>
        validateEnv(env({ DATABASE_URL: 'postgresql://x', NODE_ENV: 'production' })),
      ).toThrow(/JWT_SECRET/);
    });

    it('passes in production with strong JWT secrets and matching providers', () => {
      expect(() =>
        validateEnv(
          env({
            DATABASE_URL: 'postgresql://x',
            APP_ENV: 'production',
            JWT_SECRET: STRONG_SECRET,
            JWT_REFRESH_SECRET: STRONG_SECRET,
            EMAIL_PROVIDER: 'sendgrid',
            SENDGRID_API_KEY: 'sg-key',
            SMS_PROVIDER: 'null',
            STORAGE_PROVIDER: 's3',
            S3_BUCKET: 'bucket',
            S3_ACCESS_KEY_ID: 'akid',
            S3_SECRET_ACCESS_KEY: 'secret',
          }),
        ),
      ).not.toThrow();
    });
  });

  describe('conditional provider credentials (prod-like only)', () => {
    const prodBase = {
      DATABASE_URL: 'postgresql://x',
      APP_ENV: 'production',
      JWT_SECRET: STRONG_SECRET,
      JWT_REFRESH_SECRET: STRONG_SECRET,
      SMS_PROVIDER: 'null',
      EMAIL_PROVIDER: 'sendgrid',
      SENDGRID_API_KEY: 'sg-key',
    };

    it('requires S3 credentials when STORAGE_PROVIDER=s3 in production', () => {
      expect(() => validateEnv(env({ ...prodBase, STORAGE_PROVIDER: 's3' }))).toThrow(
        /S3_BUCKET .* is required/,
      );
    });

    it('accepts the legacy AWS_* fallbacks for S3 credentials', () => {
      expect(() =>
        validateEnv(
          env({
            ...prodBase,
            STORAGE_PROVIDER: 's3',
            AWS_S3_BUCKET_NAME: 'bucket',
            AWS_ACCESS_KEY_ID: 'akid',
            AWS_SECRET_ACCESS_KEY: 'secret',
          }),
        ),
      ).not.toThrow();
    });

    it('requires Twilio credentials when SMS_PROVIDER=twilio in production', () => {
      expect(() =>
        validateEnv(
          env({
            ...prodBase,
            SMS_PROVIDER: 'twilio',
            STORAGE_PROVIDER: 's3',
            S3_BUCKET: 'b',
            S3_ACCESS_KEY_ID: 'k',
            S3_SECRET_ACCESS_KEY: 's',
          }),
        ),
      ).toThrow(/TWILIO_ACCOUNT_SID is required/);
    });

    it('requires SMTP credentials when EMAIL_PROVIDER=smtp in production', () => {
      expect(() =>
        validateEnv(
          env({
            DATABASE_URL: 'postgresql://x',
            APP_ENV: 'production',
            JWT_SECRET: STRONG_SECRET,
            JWT_REFRESH_SECRET: STRONG_SECRET,
            SMS_PROVIDER: 'null',
            STORAGE_PROVIDER: 's3',
            S3_BUCKET: 'b',
            S3_ACCESS_KEY_ID: 'k',
            S3_SECRET_ACCESS_KEY: 's',
            EMAIL_PROVIDER: 'smtp',
          }),
        ),
      ).toThrow(/SMTP_HOST is required/);
    });

    it('does NOT require provider credentials in development', () => {
      expect(() =>
        validateEnv(
          env({
            DATABASE_URL: 'postgresql://x',
            APP_ENV: 'development',
            STORAGE_PROVIDER: 's3',
            SMS_PROVIDER: 'twilio',
            EMAIL_PROVIDER: 'smtp',
          }),
        ),
      ).not.toThrow();
    });
  });

  describe('type / enum validation', () => {
    it('rejects a non-numeric PORT', () => {
      expect(() => validateEnv(env({ DATABASE_URL: 'postgresql://x', PORT: 'abc' }))).toThrow(
        /PORT must be an integer/,
      );
    });

    it('coerces a numeric-string PORT to a number', () => {
      const result = validateEnv(env({ DATABASE_URL: 'postgresql://x', PORT: '3000' }));
      expect(result.PORT).toBe(3000);
    });

    it('rejects an invalid APP_ENV enum value', () => {
      expect(() => validateEnv(env({ DATABASE_URL: 'postgresql://x', APP_ENV: 'wrong' }))).toThrow(
        /APP_ENV must be one of/,
      );
    });

    it('rejects an invalid LOG_LEVEL', () => {
      expect(() =>
        validateEnv(env({ DATABASE_URL: 'postgresql://x', LOG_LEVEL: 'shout' })),
      ).toThrow(/LOG_LEVEL must be a valid winston level/);
    });
  });

  describe('aggregated error reporting', () => {
    it('reports every problem in a single thrown error', () => {
      let message = '';
      try {
        validateEnv(env({ APP_ENV: 'production' }));
      } catch (e) {
        message = (e as Error).message;
      }
      // Missing DATABASE_URL + both JWT secrets => at least 3 problems, one message.
      expect(message).toMatch(/cannot start/);
      expect(message).toMatch(/DATABASE_URL/);
      expect(message).toMatch(/JWT_SECRET/);
      expect(message).toMatch(/JWT_REFRESH_SECRET/);
      expect(message).toMatch(/problem\(s\)/);
    });
  });
});
